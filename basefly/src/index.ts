import {
  Action,
  ActionResult,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  composePrompt,
  elizaLogger,
  v1,
} from "@elizaos/core";


import {
  CreateFlightPlanContent,
  CreateFlightPlanSchema,
  isFlightPlanContent,
} from "../types";

import { flightPlanTemplate } from "../templates";

import airportData from "airport-iata-codes";

import { Duffel } from "@duffel/api";
import { CreateOfferRequestSlice } from "@duffel/api/types";

const duffel = new Duffel({
  // Store your access token in an environment variable, keep it secret and only readable on your server
  token: process.env.DUFFEL_ACCESS_TOKEN || "",
});

export const findFlightAction: Action = {
  name: "FIND_FLIGHTS",
  similes: [
      "GET_FLIGHTS",
      "SHOW_FLIGHT_OPTIONS",
      "BOOK_FLIGHT",
      "CHECK_FLIGHT",
  ],
  description: "Get flights from our Flight Finder API for the user",
  validate: async (_runtime: IAgentRuntime, _message: Memory, _state: State): Promise<boolean> => {
    const text =  _message.content?.text?.toLowerCase() || '';
    const flightKeywords = [
      'flight', 'fly', 'book', 'travel', 'trip', 'airport', 
      'departure', 'destination', 'origin', 'airline', 'booking',
      'ticket', 'journey', 'vacation', 'holiday', 'getaway'
  ];
   const hasFlightKeyword = flightKeywords.some(keyword => text.includes(keyword));
   if (!hasFlightKeyword) {
    return false;
   }
   const hasTravelPattern = /\b(from|to)\b/.test(text) && 
   (text.includes('airport') || text.includes('city') || text.includes('place'));
   console.log(hasFlightKeyword, hasTravelPattern);
   return hasFlightKeyword || hasTravelPattern;

  },
  handler: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      state: State,
      _options: any,
      callback: HandlerCallback
  ): Promise<ActionResult> => {
      try {
          const context = composePrompt({
              state, //what the user and agent have said so far
              template: flightPlanTemplate, //template on how to format the flight plan
          });

          //model to convert genera language to flight plan object
          const flightPlanText = await _runtime.useModel('TEXT_LARGE', {
              prompt: context,
              temperature: 0.7,
              maxTokens: 1000,
          });
          
          let flightPlan;
          try {
              flightPlan = { object: JSON.parse(flightPlanText) };
          } catch (error) {
              flightPlan = { object: {} };
          }

          if (!isFlightPlanContent(flightPlan.object)) {
              callback({ text: "Invalid flight plan provided." }, []);
              return {
                  text: 'Invalid flight plan provided',
                  values: {
                      success: false,
                      error: 'INVALID_FLIGHT_PLAN',
                  },
                  data: {
                      actionName: 'FIND_FLIGHTS',
                  },
                  success: false,
              };
          }

          const flightPlanObject = JSON.parse(
              JSON.stringify(flightPlan.object)
          );

          console.log(flightPlanObject);

          // check dates and make sure they are in the future
          const departureDate = new Date(flightPlan.object.departure_date ?? "");

          const returnDate = new Date(flightPlan.object.return_date ?? "");

          let departureDateString = flightPlan.object.departure_date;
          let returnDateString = flightPlan.object.return_date;

          if (
              departureDate < new Date() ||
              flightPlan.object.departure_date == null ||
              flightPlan.object.departure_date == "null" ||
              flightPlan.object.departure_date == "" ||
              !flightPlan.object.departure_date
          ) {
              const nextWeek = new Date();
              nextWeek.setDate(new Date().getDate() + 7);

              departureDateString = `${nextWeek.toISOString().split("T")[0]}`;
              console.log("reseting departure date");
          } else {
              departureDateString = `${departureDate.toISOString().split("T")[0]}`;
          }

          if (
              returnDate < new Date() ||
              flightPlan.object.return_date == null ||
              flightPlan.object.return_date == "null" ||
              flightPlan.object.return_date == "" ||
              !flightPlan.object.return_date
          ) {
              const nextFortnight = new Date();
              nextFortnight.setDate(new Date().getDate() + 14);

              returnDateString = `${nextFortnight.toISOString().split("T")[0]}`;
              console.log("reseting return date");
          } else {
              returnDateString = `${returnDate.toISOString().split("T")[0]}`;
          }

          // if return date is before depart date, pick a week after departure
          if (returnDate < departureDate) {
              const nextWeek = new Date(departureDateString);
              nextWeek.setDate(new Date().getDate() + 7);

              returnDateString = `${nextWeek.toISOString().split("T")[0]}`;
          }
// set the dates in the object for later
          flightPlan.object.departure_date = departureDateString;
          flightPlan.object.return_date = returnDateString;

          // handle departure times
          const departureFlightDepartureTimeAfter =
              flightPlan.object.departure_flight_departure_time_after;
          const departureFlightDepartureTimeBefore =
              flightPlan.object.departure_flight_departure_time_before;

          const returnFlightDepartureTimeAfter =
              flightPlan.object.return_flight_departure_time_after;
          const returnFlightDepartureTimeBefore =
              flightPlan.object.return_flight_departure_time_before;

          // call api to get flight data here
          const offerRequestResponse = await duffel.offerRequests.create({
              slices: [
                  {
                      origin: flightPlan.object.origin,
                      destination: flightPlan.object.destination,
                      departure_date: departureDateString,
                      departure_time: {
                          from: departureFlightDepartureTimeAfter ?? "",
                          to: departureFlightDepartureTimeBefore ?? "",
                      },
                      arrival_time: {
                          from: departureFlightDepartureTimeAfter ?? "",
                          to: departureFlightDepartureTimeBefore ?? "",
                      },
                  },
                  {
                      origin: flightPlan.object.destination,
                      destination: flightPlan.object.origin,
                      departure_date: returnDateString,
                      departure_time: {
                          from: returnFlightDepartureTimeAfter ?? "",
                          to: returnFlightDepartureTimeBefore ?? "",
                      },
                      arrival_time: {
                          from: returnFlightDepartureTimeAfter ?? "",
                          to: returnFlightDepartureTimeBefore ?? "",
                      },
                  },
              ],
              passengers: [{ type: "adult" }],
              cabin_class: "economy",
              return_offers: true,
              max_connections: 0,
          });

          let offerList = offerRequestResponse.data.offers;

          offerList.sort((a, b) => {
              if (
                  parseFloat(a.total_currency) > parseFloat(b.total_currency)
              ) {
                  return -1;
              } else {
                  return 1;
              }
          });

          const destinationAirport = airportData(
              flightPlanObject.destination
          )[0];

          const originAirport = airportData(flightPlanObject.origin)[0];

          offerList = offerList.splice(0, 1);

          // console.log(JSON.stringify(offerList));

          const offers = offerList.map((offer, offerIndex) => {
              // console.log(offer);
              const flights = offer.slices.map((slice, sliceIndex) => {
                  const segments = slice.segments.map(
                      (segment, segmentIndex) => {
                          return `Leg ${segmentIndex + 1} is on ${segment.operating_carrier.name} leaving at ${segment.departing_at}.`;
                      }
                  );

                  return `${sliceIndex == 0 ? "Departing" : "Returning"} flights: ${segments.join(".\n")}\n`;
              });

              return `option ${offerIndex + 1}: ${flights}\n price: ${offer.total_amount}`;
          });

          // console.log(JSON.stringify(offerRequestResponse.data));
// persist relevant data if needed to memory/knowledge
          const memory = {
              type: "flight_data",
              content: {
                  text: ``, // unroll data in here
                  ticket_type: "round_trip",
                  origin: flightPlan.object.origin,
                  destination: flightPlan.object.destination,
                  depart_date: departureDateString,
                  return_date: returnDateString,
                  departure_flight_departure_time_after:
                      departureFlightDepartureTimeAfter,
                  departure_flight_departure_time_before:
                      departureFlightDepartureTimeBefore,
                  return_flight_departure_time_after:
                      returnFlightDepartureTimeAfter,
                  return_flight_departure_time_before:
                      returnFlightDepartureTimeBefore,
                  flight_options: offerList, // put the api results in here
              },
              timestamp: new Date().toISOString(),
              roomId: _message.roomId,
              entityId: _message.entityId,
              agentId: _message.agentId,
          };

          // save offer data into memory for later use
          const savedMemory = await _runtime.databaseAdapter.createMemory(
              memory,
              "flight_data",
              true
          );

          // Generate flight summary using the runtime's model system (Ollama/OpenAI/etc.)
          const systemPrompt = "You are an AI travel agent named Basefly, help the user understand their flight options in an easy to consume way.";
          const userPrompt = `${offers}`;
          
          const fullPrompt = `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`;
          
          const summaryResponse = await _runtime.useModel('TEXT_LARGE', {
              prompt: fullPrompt,
              maxTokens: 1000,
              temperature: 0.7,
          });

          const messagesMemory = {
              content: {
                  text: summaryResponse,
                  source: "agent_action",
              },
              roomId: _message.roomId,
              userId: _message.userId,
              agentId: _message.agentId,
          };

          const messageManager = _runtime.getMemoryManager("messages") || _runtime.messageManager;
          const messagesMemoryWithEmbedding = await messageManager.addEmbeddingToMemory(messagesMemory);

          // save offer data into memory for later use
          await _runtime.databaseAdapter.createMemory(
              messagesMemoryWithEmbedding,
              "messages",
              true
          );

          // add this to the messages context window
          // Compose full state
          const newState = await _runtime.composeState(
              messagesMemoryWithEmbedding
          );

          // Update with recent messages
          const updatedState =
              await _runtime.updateRecentMessageState(newState);
          callback(
              {
                  action: "FIND_FLIGHTS",
                  text: summaryResponse,
                  //                     text: `Resource created successfully:
                  // - Origin: ${flightPlan.object.origin}
                  // - Destination: ${flightPlan.object.destination}
                  // - Departing/Returning: ${flightPlan.object.departure_date}/${flightPlan.object.return_date}
                  // `,
                  data: {
                      flight_plan: flightPlan,
                      offers: offerList,
                      origin_airport: originAirport,
                      destination_airport: destinationAirport,
                  },
              },
              [
                  // {
                  //     logo: offerRequestResponse.data.offers[0].slices[0]
                  //         .segments[0].operating_carrier.logo_symbol_url,
                  // },
                  { ...flightPlan },
              ]
          );

          return {
              text: 'Flight search completed successfully',
              values: {
                  success: true,
                  flightPlan: flightPlan,
                  offers: offerList,
              },
              data: {
                  actionName: 'FIND_FLIGHTS',
                  timestamp: Date.now(),
              },
              success: true,
          };
      } catch (error) {
          console.log(error);
          elizaLogger.error("Error creating resource:", error);
          callback(
              { text: "Failed to create resource. Please check the logs." },
              []
          );
          
          return {
              text: 'Failed to create resource',
              values: {
                  success: false,
                  error: 'RESOURCE_CREATION_FAILED',
              },
              data: {
                  actionName: 'FIND_FLIGHTS',
                  error: error instanceof Error ? error.message : String(error),
              },
              success: false,
              error: error instanceof Error ? error : new Error(String(error)),
          };
      }
  },
  examples: [
      [
          {
              user: "{{user1}}",
              content: {
                  text: "I need a flight from New York to London next week for 2 people in business class",
              },
          },
          {
              user: "{{agentName}}",
              content: {
                  text: `I found several flight options for your trip from New York to London:

**Option 1: British Airways**
- Departing: Monday, January 15th at 10:30 AM
- Returning: Friday, January 19th at 2:15 PM
- Price: $2,450 USD for 2 passengers
- Business class with lie-flat seats

**Option 2: American Airlines**
- Departing: Tuesday, January 16th at 8:45 AM  
- Returning: Saturday, January 20th at 4:30 PM
- Price: $2,180 USD for 2 passengers
- Business class with premium amenities

Both flights include meals, priority boarding, and lounge access. Would you like me to book one of these options or search for different dates?`,
              },
          },
      ],
      [
          {
              user: "{{user1}}",
              content: {
                  text: "Find me the cheapest flights from LAX to JFK in March",
              },
          },
          {
              user: "{{agentName}}",
              content: {
                  text: `Here are the most affordable flights from LAX to JFK in March:

**Option 1: Spirit Airlines**
- Departing: March 15th at 6:30 AM
- Price: $189 USD
- Basic economy, no checked bags included

**Option 2: JetBlue**
- Departing: March 18th at 2:15 PM
- Price: $245 USD
- Economy with free WiFi and snacks

**Option 3: Delta Airlines**
- Departing: March 22nd at 11:45 AM
- Price: $298 USD
- Economy with entertainment system

The Spirit flight is the cheapest at $189, but keep in mind it's a budget airline with additional fees for bags and seat selection. Would you like me to search for return flights as well?`,
              },
          },
      ],
  ],
  suppressInitialMessage: true,
};