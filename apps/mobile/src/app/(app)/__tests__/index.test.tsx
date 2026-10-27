import AppIndexScreen from "../index";

test("sends / to Learn", () => {
  // `/` had no route in this group at all, so the first login on a device
  // landed on expo-router's Unmatched Route screen (`mobile:///`) the moment
  // the session arrived and the navigator swapped to the (app) branch. The
  // file merely existing is what fixes the crash; this pins the destination.
  //
  // Called rather than rendered: <Redirect> needs a router context, and
  // mocking expo-router to supply one would test the mock instead of the
  // href.
  const element = AppIndexScreen() as { props: { href: string } };
  expect(element.props.href).toBe("/learn");
});
