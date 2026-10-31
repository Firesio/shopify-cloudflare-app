import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { Button } from "~/internal/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Field, FieldLabel } from "~/internal/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/internal/components/ui/select";
import { Spinner } from "~/internal/components/ui/spinner";

export interface AssignableShop {
  readonly shop: string;
  readonly name: string;
}

/**
 * For a conversation no shop owns yet: pick the shop it belongs to. Until then
 * the thread is outside every shop's reach, so the plan lookup and file
 * attachments wait for an owner.
 */
export function AssignShopCard({ shops }: { readonly shops: readonly AssignableShop[] }) {
  const [shop, setShop] = useState("");
  const navigation = useNavigation();
  const busy = navigation.state !== "idle" && navigation.formData?.get("intent") === "assign_shop";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign to a shop</CardTitle>
        <CardDescription>This conversation is not tied to a shop yet.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value="assign_shop" />
          <input type="hidden" name="shop" value={shop} />
          <Field>
            <FieldLabel htmlFor="assign-shop">Shop</FieldLabel>
            <Select value={shop} onValueChange={setShop}>
              <SelectTrigger id="assign-shop">
                <SelectValue placeholder="Select a shop" />
              </SelectTrigger>
              <SelectContent>
                {shops.map((option) => (
                  <SelectItem key={option.shop} value={option.shop}>
                    {`${option.name} (${option.shop})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" disabled={shop === "" || busy}>
            {busy ? <Spinner /> : null}
            Assign
          </Button>
        </Form>
      </CardContent>
    </Card>
  );
}
