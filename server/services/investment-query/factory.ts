import { getEventProjectionTable } from "#/database/event-projections"
import { getEventTable } from "#/database/events"
import { InvestmentQueryService } from "#/services/investment-query/service"

export async function getInvestmentQueryService() {
  const projectionTable = await getEventProjectionTable()
  if (!projectionTable) return undefined
  const eventTable = await getEventTable()
  return new InvestmentQueryService(projectionTable, eventTable)
}
