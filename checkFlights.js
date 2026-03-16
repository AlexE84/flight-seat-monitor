const axios = require("axios");

const API_URL = "https://www.elal.com/api/SeatAvailability/lang/heb/flights";

const EUROPE_AIRPORTS = [
"LHR","CDG","AMS","FRA","MUC","ZRH","VIE","MAD","BCN","FCO","MXP",
"ATH","PRG","BUD","WAW","OTP","SOF","CPH","OSL","ARN","HEL","DUB",
"LIS","BRU","GVA"
];

async function fetchFlights(){

for(let i=0;i<3;i++){

try{

const res = await axios.get(API_URL,{timeout:15000});

return res.data;

}catch(e){

console.log("Retrying API...");

}

}

throw new Error("API failed");

}

function findSeats(data){

let flights=[];

data.forEach(route=>{

if(route.routeFrom!=="TLV") return;

if(!EUROPE_AIRPORTS.includes(route.routeTo)) return;

if(!route.flightsDates) return;

let dates=[];

route.flightsDates.forEach(d=>{

if(d.seatCount>=4){

dates.push({
date:d.flightsDate,
seats:d.seatCount
});

}

});

if(dates.length>0){

flights.push({
carrier:route.flightCarrier,
flight:route.flightNumber,
to:route.routeTo,
dep:route.segmentDepTime,
dates
});

}

});

return flights;

}

function buildMessages(flights){

let messages=[];

let msg="✈ EL AL seat alert (4+ seats)\n\n";

flights.forEach(f=>{

let section=
`Flight ${f.carrier}${f.flight}
TLV → ${f.to}
Departure ${f.dep}

`;

f.dates.forEach(d=>{

let line=`• ${d.date} (${d.seats} seats)\n`;

if(d.seats>=7){

line+="🔥 possible inventory release\n";

}

section+=line;

});

section+="\n";

if((msg+section).length>3500){

messages.push(msg);
msg=section;

}else{

msg+=section;

}

});

messages.push(msg);

return messages;

}

async function sendTelegram(messages){

const token=process.env.TELEGRAM_TOKEN;
const chat=process.env.TELEGRAM_CHAT;

for(const m of messages){

await axios.post(
`https://api.telegram.org/bot${token}/sendMessage`,
{
chat_id:chat,
text:m
});

}

}

async function main(){

try{

console.log("Checking flights");

const data=await fetchFlights();

const flights=findSeats(data);

if(flights.length===0){

console.log("No seats");

return;

}

const messages=buildMessages(flights);

await sendTelegram(messages);

console.log("Alert sent");

}catch(e){

console.error(e);

}

}

main();
