import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import {
  QUESTION_CARD_ATTR,
  QuestionKeysProvider,
  useQuestionKeys,
  type QuestionKeyHandlers,
} from "./use-question-keys";

/** jsdom gives every element a zero rect, which would read as "off screen",
 * so each card is told where it is. */
function placeAt(testId: string, top: number) {
  const element = screen.getByTestId(testId);
  element.getBoundingClientRect = () =>
    ({ top, bottom: top + 100, left: 0, right: 100, width: 100, height: 100 }) as DOMRect;
}

function Card({
  id,
  optionCount = 4,
  choose,
  submit,
}: { id: string } & Partial<QuestionKeyHandlers>) {
  useQuestionKeys(id, { optionCount, choose: choose ?? vi.fn(), submit });
  return (
    <div {...{ [QUESTION_CARD_ATTR]: id }} data-testid={id}>
      {/* The shape OptionChoice renders: a label over a hidden radio. */}
      <label>
        <input type="radio" name={id} className="sr-only" onChange={() => choose?.(0)} />
        option A of {id}
      </label>
      <button type="button">check {id}</button>
      <input aria-label={`search ${id}`} />
    </div>
  );
}

describe("question number keys", () => {
  test("1 picks A, 2 picks B, and so on", async () => {
    const choose = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" choose={choose} />
      </QuestionKeysProvider>,
    );
    placeAt("q1", 10);

    await userEvent.setup().keyboard("1");
    expect(choose).toHaveBeenLastCalledWith(0);

    await userEvent.setup().keyboard("3");
    expect(choose).toHaveBeenLastCalledWith(2);
  });

  test("a key past the last option does nothing", async () => {
    const choose = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" optionCount={2} choose={choose} />
      </QuestionKeysProvider>,
    );
    placeAt("q1", 10);

    await userEvent.setup().keyboard("3");
    expect(choose).not.toHaveBeenCalled();
  });

  test("the focused question takes the keys over the one above it", async () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" choose={first} />
        <Card id="q2" choose={second} />
      </QuestionKeysProvider>,
    );
    // q1 is the top-most on screen, but the focus is inside q2.
    placeAt("q1", 10);
    placeAt("q2", 400);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "check q2" }));
    await user.keyboard("1");

    expect(second).toHaveBeenCalledWith(0);
    expect(first).not.toHaveBeenCalled();
  });

  test("with nothing focused, the top-most question on screen takes them", async () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" choose={first} />
        <Card id="q2" choose={second} />
      </QuestionKeysProvider>,
    );
    // q1 has scrolled off the top, so q2 is the one being read.
    placeAt("q1", -300);
    placeAt("q2", 50);

    await userEvent.setup().keyboard("2");

    expect(second).toHaveBeenCalledWith(1);
    expect(first).not.toHaveBeenCalled();
  });

  test("a question in an open dialog wins over the page behind it", async () => {
    const behind = vi.fn();
    const inDialog = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" choose={behind} />
        <div role="dialog">
          <Card id="q2" choose={inDialog} />
        </div>
      </QuestionKeysProvider>,
    );
    placeAt("q1", 10);
    placeAt("q2", 200);

    await userEvent.setup().keyboard("1");

    expect(inDialog).toHaveBeenCalledWith(0);
    expect(behind).not.toHaveBeenCalled();
  });

  test("typing in a field is typing, not answering", async () => {
    const choose = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" choose={choose} />
      </QuestionKeysProvider>,
    );
    placeAt("q1", 10);

    const user = userEvent.setup();
    await user.click(screen.getByRole("textbox", { name: "search q1" }));
    await user.keyboard("1");

    expect(choose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "search q1" })).toHaveValue("1");
  });

  test("a modified number key is left alone", async () => {
    const choose = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" choose={choose} />
      </QuestionKeysProvider>,
    );
    placeAt("q1", 10);

    await userEvent.setup().keyboard("{Meta>}1{/Meta}");
    expect(choose).not.toHaveBeenCalled();
  });

  test("Enter checks the answer", async () => {
    const submit = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" submit={submit} />
      </QuestionKeysProvider>,
    );
    placeAt("q1", 10);

    await userEvent.setup().keyboard("{Enter}");
    expect(submit).toHaveBeenCalled();
  });

  test("Enter on a button is the button's, not the question's", async () => {
    const submit = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" submit={submit} />
      </QuestionKeysProvider>,
    );
    placeAt("q1", 10);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "check q1" }));
    submit.mockClear();
    await user.keyboard("{Enter}");

    expect(submit).not.toHaveBeenCalled();
  });

  test("a question with nothing to check ignores Enter", async () => {
    render(
      <QuestionKeysProvider>
        <Card id="q1" />
      </QuestionKeysProvider>,
    );
    placeAt("q1", 10);

    // No submit handler: the keypress is simply not ours, and nothing throws.
    await userEvent.setup().keyboard("{Enter}");
  });

  test("picking an option with the mouse does not switch the keys off", async () => {
    const choose = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" choose={choose} />
      </QuestionKeysProvider>,
    );
    placeAt("q1", 10);

    // Clicking a label focuses its control, and every option is a label over
    // an sr-only radio -- which used to read as "they are typing".
    const user = userEvent.setup();
    await user.click(screen.getByText("option A of q1"));
    choose.mockClear();
    await user.keyboard("2");

    expect(choose).toHaveBeenCalledWith(1);
  });

  test("Enter still checks after an option was clicked", async () => {
    const submit = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" submit={submit} />
      </QuestionKeysProvider>,
    );
    placeAt("q1", 10);

    const user = userEvent.setup();
    await user.click(screen.getByText("option A of q1"));
    await user.keyboard("{Enter}");

    expect(submit).toHaveBeenCalled();
  });

  test("scrolling away from the question you picked in hands the keys on", async () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <QuestionKeysProvider>
        <Card id="q1" choose={first} />
        <Card id="q2" choose={second} />
      </QuestionKeysProvider>,
    );
    placeAt("q1", 10);
    placeAt("q2", 400);

    // Answer q1 with the mouse: the focus is now parked on its radio, and
    // nothing ever takes it away again.
    const user = userEvent.setup();
    await user.click(screen.getByText("option A of q1"));
    first.mockClear();

    // Scroll on until q1 is above the viewport and q2 is the one being read.
    placeAt("q1", -300);
    placeAt("q2", 50);
    await user.keyboard("1");

    expect(second).toHaveBeenCalledWith(0);
    expect(first).not.toHaveBeenCalled();
  });
});
