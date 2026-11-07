// app/(dashboard)/categories/page.tsx
import { MasterDataPage } from "@/components/master-data/MasterDataPage";
import { CATEGORY_SOURCE_OPTIONS } from "@/lib/category-source";

export default function CategoriesPage() {
  return (
    <MasterDataPage
      cardTitle="Product Categories"
      apiPath="/api/categories"
      resourceName="Category"
      searchPlaceholder="Search category name..."
      columns={[
        { key: "sourceLabel", label: "Source" },
        {
          key: "name",
          label: "Name",
        },
        {
          key: "description",
          label: "Description",
        },
      ]}
      fields={[
        { name: "source", label: "Source", inputType: "select", defaultValue: "SHARED", options: [...CATEGORY_SOURCE_OPTIONS], required: true },
        {
          name: "name",
          label: "Name",
          placeholder: "e.g. Chicken, Chicken Cuts, Plastic, Gloves",
          required: true,
        },
        {
          name: "description",
          label: "Description",
          placeholder: "Enter description",
          inputType: "textarea",
        },
      ]}
    />
  );
}
