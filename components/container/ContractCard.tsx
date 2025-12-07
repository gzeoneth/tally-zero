import { formSchema } from "@config/schema";
import { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import ContractForm from "@/components/form/ContractForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@components/ui/Card";

interface ContractCardProps {
  form: UseFormReturn<z.infer<typeof formSchema>>;
  progress: number;
  providerReady?: boolean;
}

export default function ContractCard({
  form,
  progress,
  providerReady,
}: ContractCardProps) {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle>Arbitrum Governance</CardTitle>
        <CardDescription>
          Vote on Arbitrum DAO proposals directly onchain.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ContractForm
          form={form}
          progress={progress}
          providerReady={providerReady}
        />
      </CardContent>
    </Card>
  );
}
