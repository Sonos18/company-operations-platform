import { z } from 'zod'
import { materialContractDocumentations, materialPaymentMethods } from '../../constants/material-finance'

/**
 * Read-side enums for views. The defaults let a client that already has these schemas read a
 * database that predates the small-order migration: a missing key means the old behavior.
 */
export const materialContractDocumentationSchema = z.enum(materialContractDocumentations).default('contract')
export const materialPaymentMethodSchema = z.enum(materialPaymentMethods).default('bank_transfer')
