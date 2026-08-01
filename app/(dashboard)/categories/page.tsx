// app/(dashboard)/categories/page.tsx
import { MasterDataPage } from "@/components/master-data/MasterDataPage";

export default function CategoriesPage() {
  return (
    <MasterDataPage
      cardTitle="All Category Info"
      apiPath="/api/categories"
      resourceName="Category"
      searchPlaceholder="Search category name..."
      columns={[
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
        {
          name: "name",
          label: "Name",
          placeholder: "Enter category name",
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
