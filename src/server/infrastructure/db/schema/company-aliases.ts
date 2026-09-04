import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { aliasTypeEnum } from "./enums";
import { createdAt } from "./helpers";
import { companies } from "./companies";

export const companyAliases = pgTable(
  "company_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    aliasType: aliasTypeEnum("alias_type").notNull(),
    aliasValue: text("alias_value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    createdAt,
  },
  (table) => [
    index("company_aliases_company_id_idx").on(table.companyId),
    uniqueIndex("company_aliases_type_value_idx").on(
      table.aliasType,
      table.normalizedValue,
    ),
  ],
);

export type CompanyAlias = typeof companyAliases.$inferSelect;
export type NewCompanyAlias = typeof companyAliases.$inferInsert;
