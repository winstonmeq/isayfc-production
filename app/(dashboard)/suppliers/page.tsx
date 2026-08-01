// app/(dashboard)/suppliers/page.tsx
import { MasterDataPage } from "@/components/master-data/MasterDataPage";

export default function SuppliersPage() {
  return (
    <MasterDataPage
      cardTitle="All Supplier Info"
      apiPath="/api/suppliers"
      resourceName="Supplier"
      searchPlaceholder="Search supplier name..."
      columns={[
        {
          key: "name",
          label: "Name",
        },
        {
          key: "email",
          label: "Email",
        },
        {
          key: "phone",
          label: "Phone",
        },
        {
          key: "address",
          label: "Address",
        },
      ]}
      fields={[
        {
          name: "name",
          label: "Name",
          placeholder: "Enter supplier name",
          required: true,
        },
        {
          name: "email",
          label: "Email",
          placeholder: "Enter email address",
          inputType: "email",
        },
        {
          name: "phone",
          label: "Phone",
          placeholder: "Enter phone number",
          inputType: "tel",
        },
        {
          name: "address",
          label: "Address",
          placeholder: "Enter address",
          inputType: "textarea",
        },
      ]}
    />
  );
}
