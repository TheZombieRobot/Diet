import {
  ACTIVITY_FACTORS,
  type ActivityLevel,
  addDislikeTerm,
  fillTemplate,
  type ProfileDraft,
  type ProfileFieldId,
  type ProfileFormCheck,
  type ReadinessQuestionId,
  under18LiftYear,
  USER_ALLERGENS,
  type UserAllergen,
} from '@diet/core';
import { profile, readiness } from '@diet/core/copy/health';
import {
  Button,
  Card,
  CheckList,
  ChoiceList,
  Notice,
  Stepper,
  Switch,
  TagList,
  TextField,
} from '@diet/ui';
import { type ReactElement, type ReactNode, type Ref, useState } from 'react';
import { routeHref } from '../../routes';
import { GateNotice } from '../GateNotice';
import { profileProblemText } from './profileErrors';

const ACTIVITY_LEVELS = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[];
const HOUSEHOLD = { min: 1, max: 20 } as const;

export interface ProfileFormProps {
  readonly mode: 'onboarding' | 'settings';
  readonly draft: ProfileDraft;
  readonly onDraftChange: (draft: ProfileDraft) => void;
  readonly check: ProfileFormCheck;
  /** After a refused Continue or Save: the field messages show. */
  readonly showErrors: boolean;
  readonly thisYear: number;
  /** "Change my answer" (q1) and "Change answer 5": in setup they open the question in the flow. */
  readonly onChangeAnswer?: ((question: ReadinessQuestionId) => void) | undefined;
  readonly formRef?: Ref<HTMLFormElement> | undefined;
  /** Shown at the top of the form: the "some details need a look" alert or a save failure. */
  readonly top?: ReactNode;
}

/**
 * The profile form (UX 1d; item 13 design section 3.8), at setup and in Settings. The submit is
 * always prevented and every button is type="button", so the keyboard's Go or Enter key never
 * submits it; Enter in the dislikes field adds the food (E68). What shows (weight, goal, Kickstart)
 * follows checkProfileForm, so typing a birth year or weight changes it at once.
 */
export function ProfileForm({
  mode,
  draft,
  onDraftChange,
  check,
  showErrors,
  thisYear,
  onChangeAnswer,
  formRef,
  top,
}: ProfileFormProps): ReactElement {
  const [dislike, setDislike] = useState('');
  const [dislikeError, setDislikeError] = useState<string | undefined>(undefined);
  const set = (patch: Partial<ProfileDraft>) => {
    onDraftChange({ ...draft, ...patch });
  };
  const error = (field: ProfileFieldId): string | undefined => {
    const problem = check.problems[field];
    return showErrors && problem !== undefined
      ? profileProblemText(field, problem, thisYear)
      : undefined;
  };
  const changeAnswer = (question: ReadinessQuestionId, label: string): ReactElement =>
    mode === 'onboarding' && onChangeAnswer !== undefined ? (
      <Button
        variant="secondary"
        onClick={() => {
          onChangeAnswer(question);
        }}
      >
        {label}
      </Button>
    ) : (
      <a className="ui-button ui-button--quiet" href={routeHref('readiness')}>
        {label}
      </a>
    );
  const addDislike = () => {
    const added = addDislikeTerm(draft.dislikeTerms, dislike);
    if (added.ok) {
      set({ dislikeTerms: added.list });
      setDislike('');
      setDislikeError(undefined);
      return;
    }
    setDislikeError(
      added.problem === 'empty'
        ? undefined
        : added.problem === 'too-long'
          ? profile.errors.dislikeTooLong
          : added.problem === 'duplicate'
            ? profile.errors.dislikeDuplicate
            : profile.errors.dislikeTooMany,
    );
  };
  const year = check.validBirthYear;

  return (
    <form
      ref={formRef}
      className="ui-card__body"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      {top}
      <Card label={profile.cards.body}>
        <TextField
          label={profile.heightLabel}
          inputMode="decimal"
          autoComplete="off"
          value={draft.heightCm}
          error={error('heightCm')}
          onChange={(event) => {
            set({ heightCm: event.currentTarget.value });
          }}
        />
        {check.show.weight ? (
          <TextField
            label={profile.weightLabel}
            inputMode="decimal"
            autoComplete="off"
            hint={check.show.weightRequired ? undefined : profile.weightOptionalHint}
            value={draft.weightKg}
            error={error('weightKg')}
            onChange={(event) => {
              set({ weightKg: event.currentTarget.value });
            }}
          />
        ) : null}
        {check.weightCheck === 'low-weight-answered-no' ? (
          <Notice>
            <p>
              {mode === 'onboarding'
                ? readiness.weightCheck.lowWeight
                : readiness.weightCheck.lowWeightStored}
            </p>
            {changeAnswer('q5', readiness.weightCheck.changeAnswer)}
          </Notice>
        ) : null}
        <TextField
          label={profile.birthYearLabel}
          inputMode="numeric"
          autoComplete="off"
          hint={profile.birthYearHint}
          value={draft.birthYear}
          error={error('birthYear')}
          onChange={(event) => {
            set({ birthYear: event.currentTarget.value });
          }}
        />
        {check.ageCheck === 'birth-year-under-18' && year !== null ? (
          <Notice>
            <p>
              {fillTemplate(readiness.ageCheck.birthYearUnder18, { year: under18LiftYear(year) })}
            </p>
          </Notice>
        ) : null}
        {check.ageCheck === 'answered-under-18-adult-birth-year' ? (
          <Notice>
            <p>{readiness.ageCheck.answeredUnder18}</p>
            {changeAnswer('q1', readiness.ageCheck.changeAnswer)}
          </Notice>
        ) : null}
        <ChoiceList
          legend={profile.sexLegend}
          name="profile-sex"
          options={[
            { value: 'female', label: profile.sexOptions.female },
            { value: 'male', label: profile.sexOptions.male },
          ]}
          value={draft.sex}
          hint={profile.sexHint}
          error={error('sex')}
          onChange={(value) => {
            set({ sex: value === 'male' ? 'male' : 'female' });
          }}
        />
      </Card>

      {mode === 'onboarding' ? (
        <Card label={profile.cards.goal}>
          {check.show.goal ? (
            <TextField
              label={profile.goalLabel}
              inputMode="decimal"
              autoComplete="off"
              hint={profile.goalHint}
              value={draft.goalKg}
              error={error('goalKg')}
              onChange={(event) => {
                set({ goalKg: event.currentTarget.value });
              }}
            />
          ) : (
            <GateNotice feature="goalSetting" link={false} gates={check.gates} />
          )}
          {check.show.kickstart ? (
            <Switch
              label={profile.kickstartLabel}
              hint={profile.kickstartHint}
              checked={draft.kickstartOptIn}
              onChange={(on) => {
                set({ kickstartOptIn: on });
              }}
            />
          ) : (
            <GateNotice feature="kickstart" link={false} gates={check.gates} />
          )}
        </Card>
      ) : null}

      <Card label={profile.cards.activity}>
        <ChoiceList
          legend={profile.activityLegend}
          name="profile-activity"
          options={ACTIVITY_LEVELS.map((level) => ({
            value: level,
            label: profile.activity[level],
          }))}
          value={draft.activityLevel}
          hint={profile.activityHint}
          onChange={(value) => {
            const level = ACTIVITY_LEVELS.find((l) => l === value);
            if (level !== undefined) set({ activityLevel: level });
          }}
        />
        <Switch
          label={profile.bandsLabel}
          checked={draft.equipmentBands}
          onChange={(on) => {
            set({ equipmentBands: on });
          }}
        />
        <Switch
          label={profile.dumbbellsLabel}
          checked={draft.equipmentDumbbells}
          onChange={(on) => {
            set({ equipmentDumbbells: on });
          }}
        />
      </Card>

      <Card label={profile.cards.household}>
        <Stepper
          label={profile.householdLabel}
          value={draft.householdSize}
          min={HOUSEHOLD.min}
          max={HOUSEHOLD.max}
          hint={profile.householdHint}
          decreaseLabel={profile.householdFewer}
          increaseLabel={profile.householdMore}
          onChange={(n) => {
            set({ householdSize: n });
          }}
        />
        {error('householdSize') === undefined ? null : (
          <p className="ui-field__error" role="alert">
            {error('householdSize')}
          </p>
        )}
        <CheckList
          legend={profile.allergensLegend}
          options={USER_ALLERGENS.map((a) => ({ value: a, label: profile.allergenNames[a] }))}
          values={draft.allergens}
          hint={profile.allergensHint}
          onChange={(values) => {
            set({ allergens: USER_ALLERGENS.filter((a: UserAllergen) => values.includes(a)) });
          }}
        />
        <TextField
          label={profile.dislikesLabel}
          hint={profile.dislikesHint}
          autoComplete="off"
          value={dislike}
          error={dislikeError}
          action={<Button onClick={addDislike}>{profile.dislikesAdd}</Button>}
          onChange={(event) => {
            setDislike(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addDislike();
          }}
        />
        {draft.dislikeTerms.length === 0 ? null : (
          <TagList
            items={draft.dislikeTerms.map((term) => ({
              key: term,
              label: term,
              removeLabel: fillTemplate(profile.dislikeRemove, { term }),
            }))}
            onRemove={(key) => {
              set({ dislikeTerms: draft.dislikeTerms.filter((t) => t !== key) });
            }}
          />
        )}
        <Switch
          label={profile.glutenFreeLabel}
          hint={profile.glutenFreeHint}
          checked={draft.glutenFreeHousehold}
          onChange={(on) => {
            set({ glutenFreeHousehold: on });
          }}
        />
      </Card>
    </form>
  );
}
