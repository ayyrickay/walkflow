import type { InferSelectModel } from "drizzle-orm";

import type { artifacts, interactions } from "@walkflow/db/schema";

export type InteractionRow = InferSelectModel<typeof interactions>;
export type ArtifactRow = InferSelectModel<typeof artifacts>;
