import { z } from 'zod';

// Flight plan schema
export const CreateFlightPlanSchema = z.object({
  originLocationCode: z.string().min(3, "Origin must be at least 3 characters"),
  destinationLocationCode: z.string().min(3, "Destination must be at least 3 characters"),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  departure_flight_departure_time_after: z.string().optional(),
  departure_flight_departure_time_before: z.string().optional(),
  return_flight_departure_time_after: z.string().optional(),
  return_flight_departure_time_before: z.string().optional(),
  travelClass: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
  adults: z.number().min(1).max(9).optional(),
});

export type CreateFlightPlanContent = z.infer<typeof CreateFlightPlanSchema>;

export function isFlightPlanContent(obj: any): obj is CreateFlightPlanContent {
  return CreateFlightPlanSchema.safeParse(obj).success;
} 