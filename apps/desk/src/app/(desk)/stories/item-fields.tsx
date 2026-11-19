import { SelectField, TextAreaField, TextField } from '@/components/form';
import { FOCI, FORMATS, SECTIONS } from '@/lib/vocab';

// Shared fields for commissioning and editing a story (rendered inside an ActionForm).
export function ItemFields({
  staff,
  defaults = {},
}: {
  staff: Record<string, string>;
  defaults?: Partial<Record<string, string>>;
}) {
  return (
    <div className="form__grid form__grid--2">
      <TextField
        name="title"
        label="Working title"
        maxLength={180}
        defaultValue={defaults.title}
        className="form__wide"
      />
      <SelectField
        name="section"
        label="Section"
        options={SECTIONS}
        placeholder="Choose a section"
        defaultValue={defaults.section}
      />
      <SelectField
        name="format"
        label="Format"
        options={FORMATS}
        placeholder="Choose a format"
        defaultValue={defaults.format}
        hint="Opinion and sponsored formats carry their label automatically."
      />
      <SelectField
        name="focus"
        label="Focus"
        options={FOCI}
        optional
        placeholder="Not set"
        defaultValue={defaults.focus}
      />
      <TextField name="dueOn" label="Due date" type="date" optional defaultValue={defaults.dueOn} />
      <SelectField
        name="assignedEditorId"
        label="Owner"
        options={staff}
        optional
        placeholder="Unassigned"
        defaultValue={defaults.assignedEditorId}
        hint="The editor responsible for the next action."
      />
      <TextField
        name="authorDisplay"
        label="Byline"
        optional
        maxLength={200}
        defaultValue={defaults.authorDisplay}
      />
      <TextField
        name="region"
        label="Regions"
        optional
        maxLength={400}
        defaultValue={defaults.region}
        hint="Comma separated, e.g. Gulf of Maine, Bristol Bay."
      />
      <TextField
        name="species"
        label="Species"
        optional
        maxLength={400}
        defaultValue={defaults.species}
        hint="Comma separated, e.g. sea scallop, oyster."
      />
      <TextAreaField
        name="summary"
        label="Summary"
        optional
        maxLength={1000}
        rows={3}
        defaultValue={defaults.summary}
        className="form__wide"
      />
    </div>
  );
}
