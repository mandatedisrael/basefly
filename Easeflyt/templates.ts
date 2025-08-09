export const flightPlanTemplate = `
Extract flight information from the user's message and return ONLY a valid JSON object with the following structure:

{
  "originLocationCode": "3-letter IATA airport code for departure",
  "destinationLocationCode": "3-letter IATA airport code for arrival",
  "departureDate": "YYYY-MM-DD format (optional)",
  "returnDate": "YYYY-MM-DD format (optional, for round trips)",
  "adults": 1,
  "travelClass": "ECONOMY"
}

IMPORTANT: 
- Return ONLY the JSON object, no other text
- Use common airport codes (JFK for New York, LHR for London, LAX for Los Angeles, etc.)
- If information is missing, use reasonable defaults
- Always include originLocationCode and destinationLocationCode
- For number of adults, default to 1 if not specified
- For travel class, use: "ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", or "FIRST" (default to "ECONOMY")

User message: {{userMessage}}

JSON response:`; 