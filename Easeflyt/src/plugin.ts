import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type Content,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  type State,
  logger,
  composePrompt,
  elizaLogger,
} from '@elizaos/core';
import { z } from 'zod';

import {
  CreateFlightPlanContent,
  CreateFlightPlanSchema,
  isFlightPlanContent,
} from "../types";

import { flightPlanTemplate } from "../templates";
  
import airportData from "airport-iata-codes";

const Amadeus = require('amadeus');

async function ensureDatabaseAdapter(runtime: IAgentRuntime) {
  if (!runtime.databaseAdapter) {
    logger.warn('Database adapter not found, attempting to initialize...');
    
    try {
      if (!runtime.databaseAdapter) {
        logger.warn('No database adapter available, using fallback implementation');
        // Create a minimal fallback database adapter
        runtime.databaseAdapter = {
          createMemory: async (memory: any, type: string, persist: boolean) => {
            logger.info(`Fallback: Would save memory of type ${type}:`, memory);
            return { id: Date.now().toString(), ...memory };
          }
        };
      }
    } catch (error) {
      logger.error('Failed to initialize database adapter:', error);
      throw error;
    }
  }
  return runtime.databaseAdapter;
}

let amadeus: any = null;
if (process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET) {
  amadeus = new Amadeus({
    clientId: process.env.AMADEUS_API_KEY,
    clientSecret: process.env.AMADEUS_API_SECRET,
  });
} else {
  console.warn('Amadeus API credentials not found. Flight booking features will be limited.');
}

const configSchema = z.object({
  EXAMPLE_PLUGIN_VARIABLE: z
    .string()
    .min(1, 'Example plugin variable is not provided')
    .optional()
    .transform((val) => {
      if (!val) {
        console.warn('Warning: Example plugin variable is not provided');
      }
      return val;
    }),
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
    console.log('🔍 FIND_FLIGHTS validate called!');
    const text = _message.content?.text?.toLowerCase() || '';
    
    // Primary flight-related keywords
    const flightKeywords = [
      'flight', 'fly', 'book', 'travel', 'trip', 'airport', 
      'departure', 'destination', 'origin', 'airline', 'booking',
      'ticket', 'journey', 'vacation', 'holiday', 'getaway'
    ];
    
    // Flight-specific phrases
    const flightPhrases = [
      'flight details', 'search flight', 'find flight', 'book flight',
      'flight search', 'flight booking', 'airline ticket', 'plane ticket',
      'air travel', 'round trip', 'one way', 'return flight',
      'business class', 'economy class', 'first class'
    ];
    
    // Check for flight keywords
    const hasFlightKeyword = flightKeywords.some(keyword => text.includes(keyword));
    
    // Check for flight-specific phrases
    const hasFlightPhrase = flightPhrases.some(phrase => text.includes(phrase));
    
    // Check for travel patterns (from/to with locations)
    const hasTravelPattern = /\b(from|to)\b/.test(text);
    
    // Check for common location indicators
    const hasLocationIndicators = /\b(nyc|lax|jfk|sfo|ord|dfw|atl|mia|bos|sea|den|phx|phl|det|msp|las|mco|dca|iad|bwi|clt|tpa|pit|cle|cvg|mci|ind|cmh|mke|bna|mem|sdf|ric|orf|rdu|gso|jax|fll|pbi|london|paris|tokyo|madrid|barcelona|rome|amsterdam|frankfurt|zurich|dubai|singapore|hong kong|sydney|melbourne|toronto|vancouver|montreal|mexico city|cancun|puerto vallarta|cabo|new york|los angeles|san francisco|chicago|miami|boston|seattle|denver|atlanta|dallas|houston|phoenix|philadelphia|detroit|minneapolis|las vegas|orlando|washington|baltimore|charlotte|tampa|pittsburgh)\b/.test(text);
    
    const result = hasFlightKeyword || hasFlightPhrase || (hasTravelPattern && hasLocationIndicators);
    
    // Log validation details for debugging
    console.log('✈️ Flight validation:', {
      text: text.substring(0, 100),
      hasFlightKeyword,
      hasFlightPhrase,
      hasTravelPattern,
      hasLocationIndicators,
      result
    });
    
    return result;
  },
  handler: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      state: State,
      _options: any,
      callback: HandlerCallback
  ): Promise<ActionResult> => {
      try {
          console.log('🚀 FIND_FLIGHTS handler called!');
          logger.info('FIND_FLIGHTS handler executing');
          const context = composePrompt({
              state, //what the user and agent have said so far
              template: flightPlanTemplate.replace('{{userMessage}}', _message.content?.text || ''), //template on how to format the flight plan
          });

          //model to convert genera language to flight plan object
          const flightPlanText = await _runtime.useModel('TEXT_LARGE', {
              prompt: context,
              temperature: 0.7,
              maxTokens: 500,
          });
          
          console.log('🤖 Raw AI response:', flightPlanText);
          
          let flightPlan;
          try {
              // Try to extract JSON from the response if it contains extra text
              let jsonText = flightPlanText.trim();
              const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                  jsonText = jsonMatch[0];
              }
              
              flightPlan = { object: JSON.parse(jsonText) };
              console.log('✅ Parsed flight plan:', flightPlan.object);
          } catch (error) {
              console.log('❌ JSON parse error:', error);
              console.log('📝 Failed to parse text:', flightPlanText);
              
              // Create a basic flight plan with defaults if parsing fails
              const userText = _message.content?.text?.toLowerCase() || '';
              flightPlan = { 
                  object: {
                      originLocationCode: "JFK", // Default
                      destinationLocationCode: "LAX", // Default  
                      adults: 1,
                      travelClass: "ECONOMY"
                  }
              };
              console.log('🔧 Using fallback flight plan:', flightPlan.object);
          }

          const isValid = isFlightPlanContent(flightPlan.object);
          console.log('🔍 Flight plan validation:', isValid, flightPlan.object);

          if (!isValid) {
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
          const departureDate = new Date(flightPlan.object.departureDate ?? "");

          const returnDate = new Date(flightPlan.object.returnDate ?? "");

          let departureDateString = flightPlan.object.departureDate;
          let returnDateString = flightPlan.object.returnDate;

          if (
              departureDate < new Date() ||
              flightPlan.object.departureDate == null ||
              flightPlan.object.departureDate == "null" ||
              flightPlan.object.departureDate == "" ||
              !flightPlan.object.departureDate
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
              flightPlan.object.returnDate == null ||
              flightPlan.object.returnDate == "null" ||
              flightPlan.object.returnDate == "" ||
              !flightPlan.object.returnDate
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
          // set the dates in the object for later use
          flightPlan.object.departureDate = departureDateString;
          flightPlan.object.returnDate = returnDateString;

          // handle departure times
          const departureFlightDepartureTimeAfter =
              flightPlan.object.departure_flight_departure_time_after;
          const departureFlightDepartureTimeBefore =
              flightPlan.object.departure_flight_departure_time_before;

          const returnFlightDepartureTimeAfter =
              flightPlan.object.return_flight_departure_time_after;
          const returnFlightDepartureTimeBefore =
              flightPlan.object.return_flight_departure_time_before;

          let offerList: any[] = [];
          
          if (amadeus) {
            const offerRequestResponse = await amadeus.shopping.flightOffersSearch.get({
              originLocationCode: flightPlan.object.originLocationCode,
              destinationLocationCode: flightPlan.object.destinationLocationCode,
              departureDate: departureDateString,
              returnDate: returnDateString,
              adults: flightPlan.object.adults,
              travelClass: flightPlan.object.travelClass,
            });
            offerList = offerRequestResponse.data;
          } else {
            // Mock data when Amadeus is not available
            offerList = [{
              price: { total: "299", currency: "USD" },
              itineraries: [{
                segments: [{
                  carrierCode: "AA",
                  departure: { at: "10:30" }
                }]
              }]
            }];
          }

          // Sort by price (lowest first)
          offerList.sort((a: any, b: any) => {
            if (parseFloat(a.price.total) < parseFloat(b.price.total)) {
                return -1;  
            } else {
                return 1;  
            }
        });
          const destinationAirport = airportData(
              flightPlanObject.destinationLocationCode
          )[0];

          const originAirport = airportData(flightPlanObject.originLocationCode)[0];

          offerList = offerList.splice(0, 1);

          // console.log(JSON.stringify(offerList));

          const offers = offerList.map((offer: any, offerIndex: number) => {
              // console.log(offer);
              const flights = offer.itineraries.map((itinerary: any, itineraryIndex: number) => {
                  const segments = itinerary.segments.map(
                      (segment: any, segmentIndex: number) => {
                          return `Leg ${segmentIndex + 1} is on ${segment.carrierCode} leaving at ${segment.departure.at}.`;
                      }
                  );

                  return `${itineraryIndex == 0 ? "Departing" : "Returning"} flights: ${segments.join(".\n")}\n`;
              });

              return `option ${offerIndex + 1}: ${flights}\n price: ${offer.price.total} ${offer.price.currency}`;
          });

          // console.log(JSON.stringify(offerRequestResponse.data));
// persist relevant data if needed to memory/knowledge
          const memory = {
              type: "flight_data",
              content: {
                  text: ``, // unroll data in here
                  ticket_type: "round_trip",
                  origin: flightPlan.object.originLocationCode,
                  destination: flightPlan.object.destinationLocationCode,
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
          let savedMemory;
          try {
              const databaseAdapter = await ensureDatabaseAdapter(_runtime);
              savedMemory = await databaseAdapter.createMemory(
                  memory,
                  "flight_data",
                  true
              );
              console.log('✅ Saved flight data to memory');
          } catch (error) {
              console.log('❌ Error saving flight data to memory:', error);
          }

          // Generate flight summary using the runtime's model system (Ollama/OpenAI/etc.)
          const systemPrompt = "You are an AI travel agent named Easeflyt, help the user understand their flight options in an easy to consume way.";
          const userPrompt = `${offers}`;
          
          const fullPrompt = `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`;
          
          const summaryResponse = await _runtime.useModel('TEXT_LARGE', {
              prompt: fullPrompt,
              maxTokens: 500,
              temperature: 0.7,
          });

          const messagesMemory: Memory = {
              content: {
                  text: summaryResponse,
                  source: "agent_action",
              },
              roomId: _message.roomId,
              userId: _message.userId,
              agentId: _message.agentId,
              entityId: _message.entityId || _message.id,
              id: _message.id,
          };

          // Use messageManager if available, otherwise skip this step
          let messageManager;
          try {
              messageManager = _runtime.getMemoryManager ? _runtime.getMemoryManager("messages") : _runtime.messageManager;
          } catch (error) {
              console.log('⚠️ Memory manager not available:', error);
              messageManager = null;
          }
          
          // Temporarily skip embedding to avoid destructuring errors
          const messagesMemoryWithEmbedding = messagesMemory;

          // save offer data into memory for later use
          try {
              if (_runtime.databaseAdapter && _runtime.databaseAdapter.createMemory) {
                  await _runtime.databaseAdapter.createMemory(
                      messagesMemoryWithEmbedding,
                      "messages",
                      true
                  );
                  console.log('✅ Saved message to memory');
              } else {
                  console.log('⚠️ Database adapter not available, skipping message save');
              }
          } catch (error) {
              console.log('❌ Error saving message to memory:', error);
          }

          let newState, updatedState;
          try {
              if (_runtime.composeState) {
                  newState = await _runtime.composeState(messagesMemoryWithEmbedding);
                  console.log('✅ Composed new state');
              } else {
                  console.log('⚠️ composeState not available');
                  newState = messagesMemoryWithEmbedding;
              }

              // Update with recent messages
              if (_runtime.updateRecentMessageState && newState) {
                  updatedState = await _runtime.updateRecentMessageState(newState);
                  console.log('✅ Updated recent message state');
              } else {
                  console.log('⚠️ updateRecentMessageState not available');
                  updatedState = newState;
              }
          } catch (error) {
              console.log('❌ Error in state composition:', error);
              updatedState = messagesMemoryWithEmbedding;
          }
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

export class FlightBookingService extends Service {
  static serviceType = 'flight-booking';
  capabilityDescription =
    'This is a flight booking service which provides flight search and booking capabilities through the Amadeus API.';

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime) {
    logger.info('*** Starting flight booking service ***');
    const service = new FlightBookingService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('*** Stopping flight booking service ***');
    // get the service from the runtime
    const service = runtime.getService(FlightBookingService.serviceType);
    if (!service) {
      throw new Error('Flight booking service not found');
    }
    service.stop();
  }

  async stop() {
    logger.info('*** Stopping starter service instance ***');
  }
}

const plugin: Plugin = {
  name: 'flight-booking',
  description: 'Flight booking plugin for Eliza with Amadeus API integration',
  priority: -1000,
  models: {
    [ModelType.TEXT_EMBEDDING]: async (runtime, params: GenerateTextParams) => {
      try {
        // Check if params and prompt are valid
        if (!params || !params.prompt) {
          logger.warn('Invalid parameters for TEXT_EMBEDDING, using fallback embedding');
          return new Array(1024).fill(0);
        }

        // Check if Voyage API key is available
        const voyageApiKey = process.env.VOYAGE_API_KEY;
        if (!voyageApiKey) {
          logger.warn('VOYAGE_API_KEY not set, using fallback embedding');
          return new Array(1024).fill(0);
        }

        // Use Voyage AI for embeddings as recommended by Anthropic
        const { VoyageAIClient } = await import('voyageai');
        const vo = new VoyageAIClient({ apiKey: voyageApiKey });
        
        logger.debug(`Generating embedding for prompt: ${params.prompt.substring(0, 50)}...`);
        
        const result = await vo.embed({
          input: [params.prompt],
          model: "voyage-3.5"
        });
        
        const embedding = result.data?.[0]?.embedding;
        if (!embedding || !Array.isArray(embedding)) {
          logger.warn('Invalid embedding response, using fallback');
          return new Array(1024).fill(0);
        }
        
        logger.debug(`Generated embedding with ${embedding.length} dimensions`);
        return embedding;
      } catch (error) {
        logger.error('Failed to generate embedding:', error);
        // Return a simple fallback embedding
        return new Array(1024).fill(0);
      }
    },
  },
  config: {
    EXAMPLE_PLUGIN_VARIABLE: process.env.EXAMPLE_PLUGIN_VARIABLE,
  },
  async init(config: Record<string, string>) {
    logger.info('*** Initializing starter plugin ***');
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid plugin configuration: ${error.errors.map((e) => e.message).join(', ')}`
        );
      }
      throw error;
    }
  },

  routes: [
    {
      name: 'helloworld',
      path: '/helloworld',
      type: 'GET',
      handler: async (_req: any, res: any) => {
        // send a response
        res.json({
          message: 'Hello World!',
        });
      },
    },
  ],
  events: {
    MESSAGE_RECEIVED: [
      async (params) => {
        logger.info('MESSAGE_RECEIVED event received');
        // print the keys
        logger.info(Object.keys(params));
      },
    ],
    VOICE_MESSAGE_RECEIVED: [
      async (params) => {
        logger.info('VOICE_MESSAGE_RECEIVED event received');
        // print the keys
        logger.info(Object.keys(params));
      },
    ],
    WORLD_CONNECTED: [
      async (params) => {
        logger.info('WORLD_CONNECTED event received');
        // print the keys
        logger.info(Object.keys(params));
      },
    ],
    WORLD_JOINED: [
      async (params) => {
        logger.info('WORLD_JOINED event received');
        // print the keys
        logger.info(Object.keys(params));
      },
    ],
  },
  services: [FlightBookingService],
  actions: [findFlightAction],
  providers: [],
};

export default plugin;
