import { createIcon } from "@hmiproject/helio-sdk";
import { companyName } from "./company";
import { namespace } from "./namespace";
import Lock from "./svg/Lock.svg";

export const iconLock = createIcon(namespace, {
  name: "Lock",
  category: companyName,
  Icon: Lock,
});

export const icons = [
  iconLock
];
