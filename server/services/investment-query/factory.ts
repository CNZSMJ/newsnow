import { getEventProjectionTable } from "#/database/event-projections"
import { InvestmentQueryService } from "#/services/investment-query/service"

export async function getInvestmentQueryService() {
  const projectionTable = await getEventProjectionTable()
  if (!projectionTable) return undefined
  return new InvestmentQueryService(projectionTable)
}
