import {
    Action,
    IAgentRuntime,
    Memory,
    HandlerCallback,
    State,
    composePrompt,
    elizaLogger,
    v1,
} from "@elizaos/core";
import OpenAI from "openai";

import {
    CreateFlightPlanContent,
    CreateFlightPlanSchema,
    isFlightPlanContent,
} from "./types";

import { flightPlanTemplate } from "./templates";

import airportData from "airport-iata-codes";

import { Duffel } from "@duffel/api";
import { CreateOfferRequestSlice } from "@duffel/api/types";

const duffel = new Duffel({
    // Store your access token in an environment variable, keep it secret and only readable on your server
    token: process.env.DUFFEL_ACCESS_TOKEN || "",
});

export const findFlightAction = {
    name: "FIND_FLIGHTS",
    similes: [
        "GET_FLIGHTS",
        "SHOW_FLIGHT_OPTIONS",
        "BOOK_FLIGHT",
        "CHECK_FLIGHT",
    ],
    description: "Get flights from our Flight Finder API for the user",
    validate: async (runtime, _message) => {
        return true;
    },
    handler: async (
        runtime,
        _message,
        state,
        _options,
        callback
    ) => {
        try {
            const context = composePrompt({
                state,
                template: flightPlanTemplate,
            });

            const flightPlanText = await runtime.queueTextCompletion(
                context,
                0.7,
                [],
                0,
                0,
                1000
            );
            
            let flightPlan;
            try {
                flightPlan = { object: JSON.parse(flightPlanText) };
            } catch (error) {
                flightPlan = { object: {} };
            }

            if (!isFlightPlanContent(flightPlan.object)) {
                callback({ text: "Invalid flight plan provided." }, []);
                return;
            }

            const flightPlanObject = JSON.parse(
                JSON.stringify(flightPlan.object)
            );

            console.log(flightPlanObject);

            // check dates and make sure they are in the future
            const departureDate = new Date(flightPlan.object.departure_date);

            const returnDate = new Date(flightPlan.object.return_date);

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
                            from: departureFlightDepartureTimeAfter,
                            to: departureFlightDepartureTimeBefore,
                        },
                        arrival_time: {
                            from: departureFlightDepartureTimeAfter,
                            to: departureFlightDepartureTimeBefore,
                        },
                    },
                    {
                        origin: flightPlan.object.destination,
                        destination: flightPlan.object.origin,
                        departure_date: returnDateString,
                        departure_time: {
                            from: returnFlightDepartureTimeAfter,
                            to: returnFlightDepartureTimeBefore,
                        },
                        arrival_time: {
                            from: returnFlightDepartureTimeAfter,
                            to: returnFlightDepartureTimeBefore,
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
                userId: _message.userId,
                agentId: _message.agentId,
            };

            // save offer data into memory for later use
            const savedMemory = await runtime.databaseAdapter.createMemory(
                memory,
                "flight_data",
                true
            );

            // have openai generate a summary response
            const client = new OpenAI({
                apiKey: process.env["OPENAI_API_KEY"], // This is the default and can be omitted
            });

            const chatCompletion = await client.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content:
                            "You are an AI travel agent named Basefly, help the user understand their flight options in an easy to consume way.",
                    },
                    {
                        role: "user",
                        content: `${offers}`,
                    },
                ],
                model: "gpt-4o",
            });

            const messagesMemory = {
                content: {
                    text: `${chatCompletion.choices[0].message.content}`,
                    source: "agent_action",
                },
                roomId: _message.roomId,
                userId: _message.userId,
                agentId: _message.agentId,
            };

            const messageManager = runtime.getMemoryManager("messages") || runtime.messageManager;
            const messagesMemoryWithEmbedding = await messageManager.addEmbeddingToMemory(messagesMemory);

            // save offer data into memory for later use
            await runtime.databaseAdapter.createMemory(
                messagesMemoryWithEmbedding,
                "messages",
                true
            );

            // add this to the messages context window
            // Compose full state
            const newState = await runtime.composeState(
                messagesMemoryWithEmbedding
            );

            // Update with recent messages
            const updatedState =
                await runtime.updateRecentMessageState(newState);
callback(
                {
                    action: "FIND_FLIGHTS",
                    text: `${chatCompletion.choices[0].message.content}`,
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
        } catch (error) {
            console.log(error);
            elizaLogger.error("Error creating resource:", error);
            callback(
                { text: "Failed to create resource. Please check the logs." },
                []
            );
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create a new resource with the name 'Resource1' and type 'TypeA'",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: `Resource created successfully:
- Name: Resource1
- Type: TypeA`,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create a new resource with the name 'Resource2' and type 'TypeB'",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: `Resource created successfully:
- Name: Resource2
- Type: TypeB`,
                },
            },
        ],
    ],
    suppressInitialMessage: true,
};