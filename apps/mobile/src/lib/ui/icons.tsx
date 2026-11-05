import Svg, { Circle, Path, Rect } from "react-native-svg";

// Generated from apps/web/src/components/icons.tsx: the same line icons
// (24-unit viewBox, 1.9 stroke, round caps), drawn with react-native-svg so
// both platforms share one icon set. Decorative -- the Pressable around an
// icon carries the accessible name.
interface IconProps {
  size?: number;
  color: string;
  strokeWidth?: number;
}

function Icon({
  size = 18,
  color,
  strokeWidth = 1.9,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {children}
    </Svg>
  );
}

export const SparkleIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z" />
    <Path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="4" />
    <Path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </Icon>
);

export const BulbIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M9 18h6M10 21h4" />
    <Path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
  </Icon>
);

export const BulbOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M9 18h6M10 21h4" />
    <Path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
    <Path d="M4 4l16 16" />
  </Icon>
);

export const NoteIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H11l-5 4v-4h-.5A1.5 1.5 0 0 1 4 14.5v-9A1.5 1.5 0 0 1 5.5 4z" />
  </Icon>
);

export const PenIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M16.5 3.5l4 4L8 20H4v-4z" />
  </Icon>
);

export const EraserIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M7 20h11" />
    <Path d="M3.8 14.6l8.7-8.7a2 2 0 0 1 2.8 0l3 3a2 2 0 0 1 0 2.8L12 18H8.2l-4.4-3.4z" />
  </Icon>
);

export const UndoIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M9 14L4 9l5-5" />
    <Path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);

export const CardsIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="3.5" y="6" width="13" height="14" rx="2" />
    <Path d="M8 3.5h10.5a2 2 0 0 1 2 2V17" />
  </Icon>
);

export const HistoryIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 12a8 8 0 1 0 2.3-5.7" />
    <Path d="M4 4v4h4" />
    <Path d="M12 8v4l2.5 2" />
  </Icon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M19 12H5M11 18l-6-6 6-6" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 5v14M5 12h14" />
  </Icon>
);

export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 12h14" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <Path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
  </Icon>
);

export const ExamIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="5" y="4" width="14" height="17" rx="2" />
    <Path d="M9 4V3h6v1M8.5 11l2 2 4-4M8.5 17h7" />
  </Icon>
);

export const MapIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6z" />
    <Path d="M9 4v14M15 6v14" />
  </Icon>
);

export const FeedIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="4" y="4" width="16" height="16" rx="2" />
    <Path d="M8 9h8M8 13h8M8 17h5" />
  </Icon>
);

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="8.5" r="3.5" />
    <Path d="M5 20a7 7 0 0 1 14 0" />
  </Icon>
);

export const WrenchIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M14.7 6.3a4 4 0 0 0 5 5l-8.4 8.4a2 2 0 0 1-2.8-2.8l8.4-8.4a4 4 0 0 1-2.2-2.2z" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </Icon>
);
