export const BUSINESS_TEST_DATABASE = "letson_business_test";

export function assertBusinessTestDatabase(database: string | undefined, source?: string) {
  if (database !== BUSINESS_TEST_DATABASE || database === source) {
    throw new Error("Business testing requires the dedicated letson_business_test database.");
  }
  return BUSINESS_TEST_DATABASE;
}
