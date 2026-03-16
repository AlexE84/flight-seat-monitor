const axios = require("axios");

// EL AL API URL
const API_URL = "https://www.elal.com/api/SeatAvailability/lang/heb/flights";

// Optional Europe filter
const EUROPE_AIRPORTS = [
  "LHR","LGW","CDG","AMS","FRA","MUC","ZRH","VIE","MAD","BCN","FCO","MXP",
  "ATH","PRG","BUD","WAW","OTP","SOF","CPH","OSL","ARN","HEL","DUB",
  "LIS","BRU","GVA"
];

/**
 * Fetch API with retry
 */
async function fetchFlights() {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await axios.get(API_URL, { timeout: 15000 });

      const res = await axios.get(API_URL, {
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36"
        }
      });
      console.log("RAW API response sample:", JSON.stringify(res).slice(0,1000)); // first 1000 chars
      return res.data;
    } catch (e) {
      console.log("API fetch failed, retrying...", i + 1);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  throw new Error("API fetch failed 3 times");
}

/**
 * Recursively extract array of routes from API response
 */
function extractRoutes(obj) {
  if (Array.isArray(obj)) return obj;
  if (!obj || typeof obj !== "object") return [];
  for (const key in obj) {
    if (Array.isArray(obj[key])) return obj[key];
    if (typeof obj[key] === "object") {
      const res = extractRoutes(obj[key]);
      if (res && res.length > 0) return res;
    }
  }
  return [];
}

/**
 * Find flights with 4+ seats, optional TLV->Europe filter
 */
function findSeats(data) {
  if (!Array.isArray(data)) {
    console.log("Invalid route list");
    return [];
  }

  const flights = [];

  data.forEach(route => {
    if (!route.flightsDates || !Array.isArray(route.flightsDates)) return;

    // Uncomment these lines if you want TLV->Europe filter
    // if (route.routeFrom !== "TLV") return;
    // if (!EUROPE_AIRPORTS.includes(route.routeTo)) return;

    const availableDates = [];

    route.flightsDates.forEach(date => {
      let totalSeats = 0;

      // Case 1: direct seatCount
      if (typeof date.seatCount === "number") totalSeats = date.seatCount;

      // Case 2: nested seatAvailability array
      if (date.seatAvailability && Array.isArray(date.seatAvailability)) {
        const seatsFromArray = date.seatAvailability.reduce(
          (sum, s) => sum + (s.seatCount || 0),
          0
        );
        totalSeats = Math.max(totalSeats, seatsFromArray);
      }

      if (totalSeats >= 4) {
        availableDates.push({ date: date.flightsDate, seats: totalSeats });
      }
    });

    if (availableDates.length > 0) {
      flights.push({
        carrier: route.flightCarrier,
        flight: route.flightNumber,
        from: route.routeFrom,
        to: route.routeTo,
        dep: route.segmentDepTime,
        dates: availableDates
      });
    }
  });

  return flights;
}

/**
 * Build Telegram messages, split if too long
 */
function buildMessages(flights) {
  const maxLength = 3500;
  let messages = [];
  let msg = "✈ EL AL seat alert (4+ seats)\n\n";

  flights.forEach(f => {
    let section = `Flight ${f.carrier}${f.flight}\n${f.from} → ${f.to}\nDeparture: ${f.dep}\n`;
    f.dates.forEach(d => {
      let line = `• ${d.date} (${d.seats} seats)\n`;
      if (d.seats >= 7) line += "🔥 possible inventory release\n";
      section += line;
    });
    section += "\n";

    if ((msg + section).length > maxLength) {
      messages.push(msg);
      msg = section;
    } else {
      msg += section;
    }
  });

  if (msg.length > 0) messages.push(msg);
  return messages;
}

/**
 * Send Telegram messages
 */
async function sendTelegram(messages) {
  const token = process.env.TELEGRAM_TOKEN;
  const chat = process.env.TELEGRAM_CHAT;

  for (const msg of messages) {
    try {
      const res = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chat,
        text: msg
      });
      console.log("Telegram response:", res.data.ok ? "OK" : res.data);
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error("Failed to send Telegram message:", e.message);
    }
  }
}

/**
 * Burst polling: check API 3 times quickly
 */
async function burstCheck() {
  let combinedFlights = [];
  for (let i = 0; i < 3; i++) {
    const raw = await fetchFlights();
    const routes = extractRoutes(raw);
    const flights = findSeats(routes);
    combinedFlights.push(...flights);
    await new Promise(r => setTimeout(r, 15000)); // 15s delay
  }

  // Remove duplicate flights
  const uniqueFlights = [];
  const seen = new Set();
  combinedFlights.forEach(f => {
    const key = `${f.carrier}-${f.flight}-${f.dep}-${f.to}`;
    if (!seen.has(key)) {
      uniqueFlights.push(f);
      seen.add(key);
    }
  });
  return uniqueFlights;
}

/**
 * Main
 */
async function main() {
  try {
    console.log("Checking flights...");
    const flights = await burstCheck();

    if (!flights || flights.length === 0) {
      console.log("No seats found");
      return;
    }

    const messages = buildMessages(flights);
    await sendTelegram(messages);
    console.log("Telegram alert sent!");
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
