import { useTranslation } from "react-i18next";
import { useNavigation } from "react-router";
import { FormSaveBar } from "./FormSaveBar";

/**
 * `FormSaveBar` for a route's form: the Save and Discard labels come from the admin's language and Save loads while
 * the router has a submission in flight. Put it inside the page's `<Form>`.
 */
export function RouteSaveBar(props: {
  readonly id: string;
  readonly result: object | undefined;
  readonly refused: boolean;
  readonly discardConfirmation?: boolean;
  /** The page carries an unsaved AI draft: the bar is up from the start (see `FormSaveBar`). */
  readonly startDirty?: boolean;
  /** The page decides whether the form changed (see `FormSaveBar`). */
  readonly dirty?: boolean;
  readonly onDiscard?: () => void;
}) {
  const { t } = useTranslation("common");
  const navigation = useNavigation();
  return (
    <FormSaveBar
      id={props.id}
      result={props.result}
      refused={props.refused}
      busy={navigation.state !== "idle"}
      saveLabel={t("actions.save")}
      discardLabel={t("actions.discard")}
      discardConfirmation={props.discardConfirmation}
      startDirty={props.startDirty}
      dirty={props.dirty}
      onDiscard={props.onDiscard}
    />
  );
}
