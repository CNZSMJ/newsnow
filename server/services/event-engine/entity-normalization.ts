import type { EntityLinkRow, EventFactRow } from "#/types"
import {
  createEntityRegistry,
  getEntityAliasKey,
  getEntityLookupTerms,
  getEntityLinkPersistenceKey,
  isCodeLikeEntityName,
  normalizeSecurityIdentifier,
  normalizeEntityLinks as registryNormalizeEntityLinks,
  normalizePrimaryEntityName as registryNormalizePrimaryEntityName,
  normalizeSecurityCode,
} from "#/services/event-engine/entity-registry"

export {
  createEntityRegistry,
  getEntityAliasKey,
  getEntityLookupTerms,
  getEntityLinkPersistenceKey,
  isCodeLikeEntityName,
  normalizeSecurityIdentifier,
  normalizeSecurityCode,
}

export function normalizeEntityLinks(rows: EntityLinkRow[]) {
  return registryNormalizeEntityLinks(rows)
}

export function normalizeFactEntityIds(rows: EventFactRow[], entityLinks: EntityLinkRow[]) {
  return createEntityRegistry(entityLinks).normalizeFactEntityIds(rows)
}

export function normalizePrimaryEntityName(primaryEntityName: string | null, entityLinks: EntityLinkRow[]) {
  return registryNormalizePrimaryEntityName(primaryEntityName, entityLinks)
}
