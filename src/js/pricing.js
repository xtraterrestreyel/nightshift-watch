// ColdCheck pricing. Change these numbers to update the landing page quote.
// Your costs (Choovio list prices, September 2026, before volume discounts):
//   Gateway UG63: about $165 (internet cable) or about $220 (cellular) plus a data plan
//   Sensor TS301 + food-grade probe: about $133
//   Setup costs per location (mounting, shipping, prep): about $95
//   Monthly cost to serve one location: about $20 to $30
export const PRICING = {
  // One-time equipment, customer owns it
  gatewayEthernet: 299,
  gatewayCellular: 399,
  sensorWithProbe: 199,
  setupActivation: 99,    // preconfigure, register, ship, remote setup call

  // Monthly monitoring plan
  baseMonthly: 49,        // per location
  perUnitMonthly: 10,     // per monitored unit

  // Yearly plan: customer pays this many months and gets 12
  annualMonthsPaid: 10,

  // Quote calculator limits
  minUnits: 1,
  maxUnits: 20,
  defaultUnits: 5
};