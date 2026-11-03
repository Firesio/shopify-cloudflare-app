import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { Button } from "~/internal/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/internal/components/ui/dialog";
import { Field, FieldLabel } from "~/internal/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/internal/components/ui/select";
import { Spinner } from "~/internal/components/ui/spinner";

export interface AssignableShop {
  readonly shop: string;
  readonly name: string;
}

/**
 * For a conversation no shop owns yet: pick the shop it belongs to. Until then the thread is outside every shop's reach, so
 * the plan lookup and file attachments wait for an owner. Assigning is rare, so it lives behind a button beside "Not
 * assigned"; once the shop is set the loader no longer offers it and the dialog goes with it.
 */
export function AssignShopDialog({ shops }: { readonly shops: readonly AssignableShop[] }) {
  const [open, setOpen] = useState(false);
  const [shop, setShop] = useState("");
  const navigation = useNavigation();
  const busy = navigation.state !== "idle" && navigation.formData?.get("intent") === "assign_shop";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Assign to a shop</Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Assign to a shop</DialogTitle>
            <DialogDescription>This conversation is not tied to a shop yet.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="intent" value="assign_shop" />
          <input type="hidden" name="shop" value={shop} />
          <Field>
            <FieldLabel htmlFor="assign-shop">Shop</FieldLabel>
            <Select value={shop} onValueChange={setShop}>
              <SelectTrigger id="assign-shop" className="w-full">
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
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={shop === "" || busy}>
              {busy ? <Spinner /> : null}
              Assign
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
