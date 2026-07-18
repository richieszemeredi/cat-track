import { Timestamp } from 'firebase/firestore'
import { z } from 'zod'
import { LIFE_STAGES, type LifeStage } from './catmath'

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

export const weightEntrySchema = z.object({
  date: timestampToDate,
  weightKg: z.number().positive().max(30),
  bodyConditionScore: z.number().int().min(1).max(9).nullable(),
  note: z.string().max(500).nullable(),
  createdBy: z.string().min(1),
  createdAt: timestampToDate,
})
export type WeightEntry = z.infer<typeof weightEntrySchema> & { id: string }

export const foodTypeSchema = z.enum(['dry', 'wet', 'treat'])
export type FoodType = z.infer<typeof foodTypeSchema>

export const foodSchema = z.object({
  name: z.string().min(1).max(80),
  brand: z.string().max(80).nullable(),
  type: foodTypeSchema,
  kcalPerGram: z.number().positive().max(10),
  packageSizeG: z.number().positive().nullable(),
  archived: z.boolean(),
  createdBy: z.string().min(1),
  createdAt: timestampToDate,
})
export type Food = z.infer<typeof foodSchema> & { id: string }

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
export type MealType = z.infer<typeof mealTypeSchema>

export const feedingSchema = z.object({
  datetime: timestampToDate,
  foodId: z.string().nullable(),
  foodNameSnapshot: z.string().min(1).max(80),
  amountG: z.number().positive().max(500),
  kcal: z.number().min(0).max(2000),
  mealType: mealTypeSchema.nullable(),
  note: z.string().max(500).nullable(),
  createdBy: z.string().min(1),
  createdAt: timestampToDate,
})
export type Feeding = z.infer<typeof feedingSchema> & { id: string }
