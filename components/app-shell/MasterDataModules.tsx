"use client";

import { useEffect, useState } from "react";
import { MasterDataPage } from "@/components/master-data/MasterDataPage";

export function CustomersModule() {
  const [outletOptions, setOutletOptions] = useState([
    { label: "Not linked to an outlet", value: "NONE" },
  ]);

  useEffect(() => {
    async function loadOutlets() {
      const response = await fetch("/api/outlets?limit=100", {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || !json.success) return;
      setOutletOptions([
        { label: "Not linked to an outlet", value: "NONE" },
        ...(json.data || []).map((outlet: { _id: string; name: string; code?: string }) => ({
          label: outlet.code ? `${outlet.name} (${outlet.code})` : outlet.name,
          value: outlet._id,
        })),
      ]);
    }
    void loadOutlets();
  }, []);

  return (
    <MasterDataPage
      title="Customers"
      cardTitle="All Customer Info"
      apiPath="/api/customers"
      resourceName="Customer"
      searchPlaceholder="Search customer name..."
      columns={[
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "address", label: "Address" },
        { key: "type", label: "Type" },
        { key: "outletName", label: "Linked Outlet" },
      ]}
      fields={[
        {
          name: "name",
          label: "Name",
          placeholder: "Enter customer name",
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
        {
          name: "type",
          label: "Type",
          inputType: "select",
          defaultValue: "SALE",
          options: [
            { label: "Sale", value: "SALE" },
            { label: "Delivery", value: "DELIVERY" },
            { label: "Both", value: "BOTH" },
          ],
        },
        {
          name: "outletId",
          label: "Linked Outlet",
          inputType: "select",
          defaultValue: "NONE",
          options: outletOptions,
          placeholder: "Select an outlet",
        },
      ]}
    />
  );
}

export function SuppliersModule() {
  return (
    <MasterDataPage
      title="Suppliers"
      cardTitle="All Supplier Info"
      apiPath="/api/suppliers"
      resourceName="Supplier"
      searchPlaceholder="Search supplier name..."
      columns={[
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "address", label: "Address" },
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

export function CategoriesModule() {
  return (
    <MasterDataPage
      title="Categories"
      cardTitle="All Category Info"
      apiPath="/api/categories"
      resourceName="Category"
      searchPlaceholder="Search category name..."
      columns={[
        { key: "name", label: "Name" },
        { key: "description", label: "Description" },
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
