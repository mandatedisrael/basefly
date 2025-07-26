import { z } from 'zod';

// Flight plan schema
export const CreateFlightPlanSchema = z.object({
  origin: z.string().min(3, "Origin must be at least 3 characters"),
  destination: z.string().min(3, "Destination must be at least 3 characters"),
  departure_date: z.string().optional(),
  return_date: z.string().optional(),
  departure_flight_departure_time_after: z.string().optional(),
  departure_flight_departure_time_before: z.string().optional(),
  return_flight_departure_time_after: z.string().optional(),
  return_flight_departure_time_before: z.string().optional(),
  cabin_class: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
  passengers: z.number().min(1).max(9).optional(),
});

export type CreateFlightPlanContent = z.infer<typeof CreateFlightPlanSchema>;

export function isFlightPlanContent(obj: any): obj is CreateFlightPlanContent {
  return CreateFlightPlanSchema.safeParse(obj).success;
} 