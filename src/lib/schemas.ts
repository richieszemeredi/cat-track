import { Timestamp } from 'firebase/firestore'
import { z } from 'zod'
import {
  FOOD_TYPES,
  LIFE_STAGES,
  type FoodAnalysis,
  type FoodType,
  type LifeStage,
} from './catmath'
import {
  MAX_MEALS_PER_DAY,
  MAX_TRANSITION_STEPS,
  MIN_MEALS_PER_DAY,
  TRANSITION_UNITS,
  type PlanTransition,
  type TransitionUnit,
} from './plan'

// Zod schemas validate every Firestore READ at the boundary (via safeParse in
// db.ts) so one corrupt/legacy document degrades gracefully instead of
// white-screening. Security rules remain the write-integrity boundary.

/** Firestore Timestamp -> Date at the parse boundary. */
const timestampToDate = z.instanceof(Timestamp).transform((t) => t.toDate())
const nullableTimestampToDate = z
  .union([z.instanceof(Timestamp), z.null()])
  .transform((t) => (t === null ? null : t.toDate()))

export const roleSchema = z.enum(['owner', 'editor', 'viewer'])
export type Role = z.infer<typeof roleSchema>

export const householdSchema = z.object({
  name: z.string().min(1).max(60),
  createdAt: timestampToDate,
  ownerUid: z.string().min(1),
})
export type Household = z.infer<typeof householdSchema> & { id: string }

export const memberSchema = z.object({
  uid: z.string().min(1),
  role: roleSchema,
  joinedAt: timestampToDate,
  displayName: z.string().max(60),
})
export type Member = z.infer<typeof memberSchema> & { id: string }

export const lifeStageSchema = z.enum(LIFE_STAGES)
export type { LifeStage }

export const sexSchema = z.enum(['male', 'female', 'unknown'])
export type Sex = z.infer<typeof sexSchema>

export const catSchema = z.object({
  name: z.string().min(1).max(50),
  birthDate: timestampToDate,
  breed: z.string().max(60).nullable(),
  sex: sexSchema,
  neutered: z.boolean(),
  neuterDate: nullableTimestampToDate,
  idealWeightKg: z.number().positive().max(30).nullable(),
  lifeStage: lifeStageSchema.nullable(),
  merMultiplierOverride: z.number().positive().max(5).nullable(),
  householdId: z.string().min(1),
  createdBy: z.string().min(1),
  createdAt: timestampToDate,
  updatedAt: timestampToDate,
})
export type Cat = z.infer<typeof catSchema> & { id: string }

// Retired fields (bodyConditionScore on weights, packageSizeG on foods,
// mealType on feedings) are simply absent here: z.object strips unknown keys,
// so documents written before they were dropped still parse cleanly.
export const weightEntrySchema = z.object({
  date: timestampToDate,
  weightKg: z.number().positive().max(30),
  note: z.string().max(500).nullable(),
  createdBy: z.string().min(1),
  createdAt: timestampToDate,
})
export type WeightEntry = z.infer<typeof weightEntrySchema> & { id: string }

export const foodTypeSchema = z.enum(FOOD_TYPES)
export type { FoodType }

const pctSchema = z.number().min(0).max(100)

/** The label's analytical constituents, kept so the calculator can be reopened. */
export const foodAnalysisSchema = z.object({
  proteinPct: pctSchema,
  fatPct: pctSchema,
  ashPct: pctSchema,
  fibrePct: pctSchema,
  moisturePct: pctSchema,
})
export type { FoodAnalysis }

export const foodSchema = z.object({
  name: z.string().min(1).max(80),
  brand: z.string().max(80).nullable(),
  type: foodTypeSchema,
  kcalPerGram: z.number().positive().max(10),
  // Absent on every food written before the label calculator existed, hence
  // the default rather than a bare .nullable() — those docs must keep parsing.
  analysis: foodAnalysisSchema.nullable().default(null),
  archived: z.boolean(),
  createdBy: z.string().min(1),
  createdAt: timestampToDate,
})
export type Food = z.infer<typeof foodSchema> & { id: string }

export const feedingSchema = z.object({
  datetime: timestampToDate,
  foodId: z.string().nullable(),
  foodNameSnapshot: z.string().min(1).max(80),
  amountG: z.number().positive().max(500),
  kcal: z.number().min(0).max(2000),
  note: z.string().max(500).nullable(),
  // Which planned bowl this feeding ticks off; null for anything off-plan.
  // Defaults rather than bare .nullable() — every feeding written before the
  // planner existed lacks both keys, and a required-but-absent key would fail
  // safeParse and silently drop the whole meal history.
  planId: z.string().nullable().default(null),
  mealIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_MEALS_PER_DAY - 1)
    .nullable()
    .default(null),
  createdBy: z.string().min(1),
  createdAt: timestampToDate,
})
export type Feeding = z.infer<typeof feedingSchema> & { id: string }

const mealTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

/**
 * A one-way switch onto the plan's food. Stored as the model's second nested
 * map (after a food's `analysis`), so the rules validate it with hasAll as well
 * as hasOnly — a half-filled transition would let a ratio be derived from a
 * ramp nobody described.
 */
export const planTransitionSchema = z.object({
  fromFoodId: z.string().min(1),
  fromFoodNameSnapshot: z.string().min(1).max(80),
  toFoodId: z.string().min(1),
  steps: z.number().int().min(1).max(MAX_TRANSITION_STEPS),
  unit: z.enum(TRANSITION_UNITS),
  startedOn: timestampToDate,
})
export type { PlanTransition, TransitionUnit }

/**
 * A feeding plan. Meals are not stored: `mealsPerDay` plus the window derives
 * them (see plan.ts). Plans are never edited in place — a revision is a new
 * doc, and the previous plan is closed by the next one's `effectiveFrom`, so
 * two phones can never write overlapping date ranges.
 */
export const planSchema = z.object({
  effectiveFrom: timestampToDate,
  mealsPerDay: z.number().int().min(MIN_MEALS_PER_DAY).max(MAX_MEALS_PER_DAY),
  firstMealAt: mealTimeSchema,
  lastMealAt: mealTimeSchema,
  // What she weighed when the plan was set — this is what later lets the app
  // say "she's 1.94 kg now, this was set at 1.62".
  setAtWeightKg: z.number().positive().max(30).nullable().default(null),
  transition: planTransitionSchema.nullable().default(null),
  note: z.string().max(500).nullable(),
  createdBy: z.string().min(1),
  createdAt: timestampToDate,
})
export type Plan = z.infer<typeof planSchema> & { id: string }

/** One food in the day's mix. Grams are per DAY; the serving is derived. */
export const planItemSchema = z.object({
  foodId: z.string().min(1),
  foodNameSnapshot: z.string().min(1).max(80),
  amountPerDayG: z.number().positive().max(2000),
})
export type PlanItem = z.infer<typeof planItemSchema> & { id: string }
