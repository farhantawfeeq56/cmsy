"use server";

import { searchEverything, type SearchHit } from "@/db";

/**
 * The sidebar palette's read. A server action rather than a route handler, to
 * match how the rest of the dashboard reaches the database.
 */
export async function search(term: string): Promise<SearchHit[]> {
  return searchEverything(typeof term === "string" ? term : "");
}
