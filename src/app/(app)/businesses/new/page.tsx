import { CreateBusinessForm } from "@/components/businesses/create-business-form";
import { Card } from "@/components/ui/card";

export const metadata = {
  title: "Create a business · WinBack",
};

export default function NewBusinessPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create a business</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add another business you run. You will switch to it as soon as it is created.
        </p>
      </header>
      <Card>
        <CreateBusinessForm />
      </Card>
    </div>
  );
}
