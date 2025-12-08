import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@components/ui/Card";
import { Skeleton } from "@components/ui/Skeleton";

export default function SearchSkeleton() {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-8 w-64" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-4 w-96 mt-2" />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Skeleton className="h-5 w-20" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
