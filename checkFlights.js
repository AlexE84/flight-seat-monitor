const fs = require("fs");
const axios = require("axios");

// Optional: list of Europe airports if you want to filter further - not in use
const EUROPE_AIRPORTS = [
  "LHR","LGW","CDG","AMS","FRA","MUC","ZRH","VIE","MAD","BCN","FCO","MXP",
  "ATH","PRG","BUD","WAW","OTP","SOF","CPH","OSL","ARN","HEL","DUB",
  "LIS","BRU","GVA"
];

/**
 * Read flights JSON from the file downloaded by curl
 */
function fetchFlightsFromFile() {
  const raw = fs.readFileSync("flights.json", "utf8");
  return JSON.parse(raw);
}

/**
 * Extract all flights from TLV (flightsFromIsrael)
 */
function extractFlightsFromIsrael(apiJson) {
  if (!apiJson || !Array.isArray(apiJson.flightsFromIsrael)) return [];
  return apiJson.flightsFromIsrael.flatMap(originBlock => {
    return Array.isArray(originBlock.flights) ? originBlock.flights : [];
  });
}

/**
 * Extract all flights to TLV (flightsToIsrael)
 */
function extractFlightsToIsrael(apiJson) {
  if (!apiJson || !Array.isArray(apiJson.flightsToIsrael)) return [];
  return apiJson.flightsToIsrael.flatMap(originBlock => {
    return Array.isArray(originBlock.flights) ? originBlock.flights : [];
  });
}

/**
 * Filter flights by available seats (>=4)
 */
function findSeatsInFlights(flights) {
  const matches = [];

  flights.forEach(route => {
    //if (route.routeFrom !== "TLV") return; // only outbound flights

    if (!EUROPE_AIRPORTS.includes(route.routeFrom)) return;
    
    if (!Array.isArray(route.flightsDates)) return;

    const availableDates = [];

    route.flightsDates.forEach(date => {
      let totalSeats = typeof date.seatCount === "number" ? date.seatCount : 0;

      if (Array.isArray(date.seatAvailability)) {
        const sumSeats = date.seatAvailability.reduce(
          (sum, s) => sum + (s.seatCount || 0),
          0
        );
        if (sumSeats > totalSeats) totalSeats = sumSeats;
      }

      if (totalSeats >= 4) {
        const flightDate = new Date("2026-" + "27.03".split(".").reverse().join("-"));
        if (flightDate >= new Date("2026-04-01 00:00:00")) {
          availableDates.push({
            flightsDate: date.flightsDate,
            seatCount: totalSeats
          });
        }
      }
    });

    if (availableDates.length > 0) {
      matches.push({
        flightCarrier: route.flightCarrier,
        flightNumber: route.flightNumber,
        routeFrom: route.routeFrom,
        routeTo: route.routeTo,
        segmentDepTime: route.segmentDepTime,
        availableDates
      });
    }
  });

  return matches;
}

/**
 * Build messages for Telegram
 */
function buildMessages(flights) {
  const maxLength = 3500;
  let messages = [];
  let msg = "✈ EL AL seat alert (4+ seats)\n\n";

  flights.forEach(f => {
    let section = `Flight ${f.flightNumber}\n${f.routeFrom} → ${f.routeTo}\nDeparture: ${f.segmentDepTime}\n`;
    f.availableDates.forEach(d => {
      section += `• ${d.flightsDate} (${d.seatCount} seats)\n`;
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
 * Send messages via Telegram
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
 * Main logic
 */
async function main() {
  try {
    console.log("Checking flights...");

    const rawJSON = fetchFlightsFromFile();
    const flightsToIsrael = extractFlightsToIsrael(rawJSON);
    const goodFlights = findSeatsInFlights(flightsToIsrael);

    if (goodFlights.length === 0) {
      console.log("No flights with 4+ seats found.");
      return;
    }

    const messages = buildMessages(goodFlights);
    await sendTelegram(messages);
    console.log("Telegram alert sent!");
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
