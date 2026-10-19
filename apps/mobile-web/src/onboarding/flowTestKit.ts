// Shared steps for the first-run component tests (item 13). Imported only by tests.
import { READINESS_QUESTION_IDS, type ReadinessQuestionId } from '@diet/core';
import { alcohol, onboarding, profile, readiness } from '@diet/core/copy/health';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { expect } from 'vitest';
import { App } from '../App';
import { routeHref, type RouteId } from '../routes';

export const h1 = (): HTMLElement => screen.getByRole('heading', { level: 1 });

/** Renders the app at a hash and waits for its first heading. */
export async function openApp(hash = ''): Promise<void> {
  window.location.hash = hash;
  render(createElement(App));
  await screen.findByRole('heading', { level: 1 });
}

/** Waits until the page's heading reads `text`. */
export async function headingIs(text: string): Promise<void> {
  await waitFor(() => {
    expect(h1().textContent).toBe(text);
  });
}

export function tap(name: string | RegExp): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

export function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Moves to a route the way a link does. */
export async function go(route: RouteId): Promise<void> {
  await act(async () => {
    window.location.hash = routeHref(route);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();
  });
}

/** Welcome, then "I understand", landing on question 1. */
export async function passNotice(): Promise<void> {
  await openApp();
  await headingIs(onboarding.welcome.title);
  tap(onboarding.frame.continue);
  await headingIs(alcohol.notice.title);
  tap(alcohol.notice.acknowledge);
  await headingIs(readiness.questions.q1);
}

/** Answers one question; a yes goes on through its consequence card. */
export async function answer(q: ReadinessQuestionId, value: 'yes' | 'no'): Promise<void> {
  await headingIs(readiness.questions[q]);
  tap(value === 'yes' ? readiness.yes : readiness.no);
  if (value === 'yes') {
    await screen.findByTestId('consequence');
    tap(onboarding.frame.continue);
  }
}

/** Answers every question from `from` on ("no" unless given), landing on the summary. */
export async function answerAll(
  answers: Partial<Record<ReadinessQuestionId, 'yes' | 'no'>> = {},
  from: ReadinessQuestionId = 'q1',
): Promise<void> {
  for (const q of READINESS_QUESTION_IDS.slice(READINESS_QUESTION_IDS.indexOf(from))) {
    await answer(q, answers[q] ?? 'no');
  }
  await headingIs(readiness.summaryTitle);
}

export interface ProfileInput {
  readonly height?: string;
  readonly weight?: string;
  readonly year?: string;
  readonly goal?: string;
}

/** Fills the profile step's required fields (synthetic: 175 cm, 90 kg, born 1970, female). */
export function fillProfile({
  height = '175',
  weight = '90',
  year = '1970',
  goal,
}: ProfileInput = {}): void {
  type(profile.heightLabel, height);
  type(profile.weightLabel, weight);
  type(profile.birthYearLabel, year);
  fireEvent.click(screen.getByRole('radio', { name: profile.sexOptions.female }));
  if (goal !== undefined) type(profile.goalLabel, goal);
}

/** From the summary through the profile, landing on the schedule or the garden. */
export async function throughProfile(input: ProfileInput = {}): Promise<void> {
  tap(onboarding.frame.continue);
  await headingIs(profile.title);
  fillProfile(input);
  tap(onboarding.frame.continue);
  await waitFor(() => {
    expect(h1().textContent).not.toBe(profile.title);
  });
}
