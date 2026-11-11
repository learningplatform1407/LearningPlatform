import { plural } from "../../plural";
import type { Messages } from "../en";

export const social: Messages["social"] = {
  findPeople: "Găsește persoane",
  peopleTitle: "Persoane",
  learner: "Cursant",
  tabs: {
    search: "Caută",
    following: "Urmărești",
    followers: "Urmăritori",
  },
  searchLabel: "Caută cursanți după nume",
  searchPlaceholder: "Caută după nume",
  searchHint: "Scrie cel puțin 2 litere. Apar doar cursanții cu profil public.",
  searching: "Se caută...",
  noResults: "Nu am găsit pe nimeni pentru „{query}”.",
  followersCount: plural({
    one: "{count} urmăritor",
    few: "{count} urmăritori",
    other: "{count} de urmăritori",
  }),
  followingCount: "Urmărește {count}",
  follow: "Urmărește",
  following: "Urmărești",
  followName: "Urmărește {name}",
  unfollowName: "Nu mai urmări {name}",
  followsYou: "Te urmărește",
  remove: "Elimină",
  removeFollowerName: "Elimină {name} dintre urmăritori",
  emptyFollowing: "Nu urmărești pe nimeni încă. Caută persoane pe care să le urmărești.",
  emptyFollowers: "Niciun urmăritor încă.",
  privateNotice: "Profilul tău este privat, deci ceilalți nu te pot găsi sau urmări.",
  privateNoticeLink: "Schimbă asta din setările de confidențialitate",
  notFound: "Acest profil este privat sau nu există.",
  loadFailed: "Nu s-a putut încărca: {message}",
  actionFailed: "Nu a funcționat: {message}",
};
