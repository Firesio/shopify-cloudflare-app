import { Mail, Store } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/internal/components/ui/avatar";
import { Badge } from "~/internal/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "~/internal/components/ui/field";
import { Input } from "~/internal/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "~/internal/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/internal/components/ui/select";
import { CATEGORY_LABEL_EN, SUPPORT_CATEGORIES, toSupportCategory } from "~/support/categories";
import { SUBJECT_MAX } from "~/schemas/support";
import type { NewTicketForm, ShopContactInfo } from "./new-form-state";

function ShopSelect({ shops, form }: { readonly shops: readonly ShopContactInfo[]; readonly form: NewTicketForm }) {
  return (
    <Field>
      <FieldLabel htmlFor="shop-select">Target store</FieldLabel>
      <Select value={form.selectedShop} onValueChange={(val) => form.setSelectedShop(val)}>
        <SelectTrigger id="shop-select">
          <SelectValue placeholder="Select a store" />
        </SelectTrigger>
        <SelectContent>
          {shops.map((s) => (
            <SelectItem key={s.shop} value={s.shop}>
              {s.shopName ? `${s.shopName} (${s.shop})` : s.shop} {s.isDevStore ? "(Dev Store)" : ""}
            </SelectItem>
          ))}
          <SelectItem value="custom">Other / Custom store domain</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

function CustomShopField({ form }: { readonly form: NewTicketForm }) {
  return (
    <Field>
      <FieldLabel htmlFor="customShop">Custom store domain</FieldLabel>
      <Input
        id="customShop"
        name="customShop"
        value={form.customShop}
        onChange={(e) => form.setCustomShop(e.target.value)}
        placeholder="e.g. luxe-bbq.myshopify.com or custom domain"
        required
      />
    </Field>
  );
}

/** Auto-resolved store banner. */
function ContactBanner({ contact }: { readonly contact: ShopContactInfo }) {
  return (
    <Item variant="muted">
      <ItemMedia>
        <Avatar>
          {contact.logoUrl && <AvatarImage src={contact.logoUrl} alt="" />}
          <AvatarFallback>
            <Store className="size-4" />
          </AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {contact.shopName}
          {contact.isDevStore && <Badge variant="secondary">Dev store</Badge>}
        </ItemTitle>
        <ItemDescription className="flex items-center gap-1.5">
          <Mail className="size-3.5 shrink-0" />
          {contact.merchantEmail ? (
            <span className="font-mono">{contact.merchantEmail}</span>
          ) : (
            <span>No email address in records (portal notification only)</span>
          )}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Badge variant={contact.merchantEmail ? "outline" : "secondary"}>
          {contact.merchantEmail ? "Auto-detected" : "No email"}
        </Badge>
      </ItemActions>
    </Item>
  );
}

function CategoryAndCc({ form }: { readonly form: NewTicketForm }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="category">Category</FieldLabel>
        <Select
          name="category"
          value={form.category}
          onValueChange={(val) => form.setCategory(toSupportCategory(val) ?? "question")}
        >
          <SelectTrigger id="category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {SUPPORT_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {CATEGORY_LABEL_EN[cat]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="ccEmails">CC emails (optional)</FieldLabel>
        <Input id="ccEmails" name="ccEmails" placeholder="e.g. support@example.com, dev@example.com" />
        <FieldDescription>Separate several addresses with commas.</FieldDescription>
      </Field>
    </div>
  );
}

function SubjectField({ form }: { readonly form: NewTicketForm }) {
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor="subject">Subject</FieldLabel>
        <span className="text-xs text-muted-foreground tabular-nums">
          {form.subject.length}/{SUBJECT_MAX}
        </span>
      </div>
      <Input
        id="subject"
        name="subject"
        value={form.subject}
        onChange={(e) => form.setSubject(e.target.value)}
        maxLength={SUBJECT_MAX}
        placeholder="e.g. Follow-up regarding intake form setup"
        required
      />
    </Field>
  );
}

export function RecipientCard({ shops, form }: { readonly shops: readonly ShopContactInfo[]; readonly form: NewTicketForm }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipient and classification</CardTitle>
        <CardDescription>
          Choose the destination merchant store. Contact email is retrieved from store records.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <ShopSelect shops={shops} form={form} />
          {form.selectedShop === "custom" && <CustomShopField form={form} />}
          {form.effectiveShop && <ContactBanner contact={form.currentContact} />}
          <CategoryAndCc form={form} />
          <SubjectField form={form} />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
