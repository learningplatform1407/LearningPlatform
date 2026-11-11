import type { Messages } from "../en";

import { admin } from "./admin";
import { auth } from "./auth";
import { bank } from "./bank";
import { book } from "./book";
import { common } from "./common";
import { exams } from "./exams";
import { feed } from "./feed";
import { learn, library } from "./learn";
import { lesson } from "./lesson";
import { nav } from "./nav";
import { colors, notebook } from "./notebook";
import { profile } from "./profile";
import { daily, questions } from "./questions";
import { settings } from "./settings";
import { social } from "./social";
import { study } from "./study";

export const ro: Messages = {
  common,
  nav,
  auth,
  settings,
  learn,
  library,
  book,
  questions,
  daily,
  bank,
  admin,
  study,
  notebook,
  colors,
  profile,
  social,
  feed,
  exams,
  lesson,
};
