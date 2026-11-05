import type { RoomState } from "@/lib/data";

const stateFill: Record<RoomState, string> = {
  available: "rgba(140, 195, 201, 0.34)",
  held: "rgba(240, 185, 138, 0.9)",
  frozen: "rgba(212, 70, 90, 0.16)",
  expired: "rgba(123, 135, 148, 0.08)",
};

const roomTints = [
  "var(--room-1)",
  "var(--room-2)",
  "var(--room-3)",
];

export function RoomGlyph({
  index = 1,
  state = "available",
  label,
}: {
  index?: number;
  state?: RoomState;
  label?: string;
}) {
  const cx = (x: number, z: number) => 160 + (x - z) * 1.5;
  const cy = (x: number, z: number) => 62 + (x + z) * 0.66;
  const poly = (x1: number, z1: number, x2: number, z2: number) =>
    [
      [cx(x1, z1), cy(x1, z1)],
      [cx(x2, z1), cy(x2, z1)],
      [cx(x2, z2), cy(x2, z2)],
      [cx(x1, z2), cy(x1, z2)],
    ]
      .map((point) => point.join(","))
      .join(" ");

  const roomRects = [
    { x1: -54, z1: -44, x2: -4, z2: -2 },
    { x1: 4, z1: -44, x2: 54, z2: -2 },
    { x1: -54, z1: 4, x2: -4, z2: 46 },
    { x1: 4, z1: 4, x2: 54, z2: 46 },
  ];

  const filled = stateFill[state];

  return (
    <svg
      viewBox="0 0 320 200"
      role="img"
      aria-label={`Isometric plan of the flat with room ${index} highlighted`}
    >
      <defs>
        <pattern
          id="glyph-hatch"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke="rgba(212, 70, 90, 0.5)"
            strokeWidth="1"
          />
        </pattern>
        <pattern
          id="glyph-grid"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M5 0H0V5"
            fill="none"
            stroke="rgba(22, 35, 59, 0.12)"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>

      <rect x="0" y="0" width="320" height="200" fill="transparent" />

      {/* dimension rules */}
      <g stroke="rgba(123, 135, 148, 0.7)" strokeWidth="0.7" fill="none">
        <path d="M52 176H268" strokeDasharray="2 3" />
        <path d="M52 171v10M268 171v10" />
        <path d="M40 54v116" strokeDasharray="2 3" />
        <path d="M35 54h10M35 170h10" />
      </g>
      <text
        x="160"
        y="188"
        textAnchor="middle"
        fontFamily="var(--font-mono), monospace"
        fontSize="7"
        fill="var(--graphite)"
      >
        ROOM PLAN · 3 BHK
      </text>

      <g>
        {roomRects.map((rect, i) => {
          const isSelected = i === index;
          const fill = isSelected
            ? state === "held"
              ? filled
              : state === "frozen"
                ? "url(#glyph-hatch)"
                : state === "expired"
                  ? filled
                  : stateFill.available
            : i === 3
              ? "rgba(22, 35, 59, 0.035)"
              : "rgba(238, 241, 244, 0.8)";
          return (
            <g key={i}>
              <polygon
                points={poly(rect.x1, rect.z1, rect.x2, rect.z2)}
                fill={fill}
                stroke="rgba(22, 35, 59, 0.7)"
                strokeWidth={i === 3 ? "0.75" : "1.25"}
              />
              {isSelected && i !== 3 && (
                <polygon
                  points={poly(rect.x1, rect.z1, rect.x2, rect.z2)}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth="2"
                />
              )}
            </g>
          );
        })}

        {/* outer wall */}
        <polygon
          points={poly(-54, -44, 54, 46)}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2.4"
        />

        {/* partitions */}
        <g stroke="var(--ink)" strokeWidth="1.2" fill="none">
          <path d={`M${cx(-4, -44)} ${cy(-4, -44)}L${cx(-4, -2)} ${cy(-4, -2)}`} />
          <path d={`M${cx(4, -44)} ${cy(4, -44)}L${cx(4, -2)} ${cy(4, -2)}`} />
          <path d={`M${cx(-4, -2)} ${cy(-4, -2)}L${cx(54, -2)} ${cy(54, -2)}`} />
          <path d={`M${cx(-54, 4)} ${cy(-54, 4)}L${cx(54, 4)} ${cy(54, 4)}`} />
          <path d={`M${cx(-4, 4)} ${cy(-4, 4)}L${cx(-4, 46)} ${cy(-4, 46)}`} />
        </g>

        {/* door swings */}
        <g stroke="rgba(123, 135, 148, 0.8)" strokeWidth="0.8" fill="none">
          <path d={`M${cx(-16, -2)} ${cy(-16, -2)}a 10 7 0 0 1 10 -7`} />
          <path d={`M${cx(16, -2)} ${cy(16, -2)}a 10 7 0 0 0 -10 -7`} />
          <path d={`M${cx(-16, 4)} ${cy(-16, 4)}a 10 7 0 0 0 10 7`} />
          <path d={`M${cx(16, 4)} ${cy(16, 4)}a 10 7 0 0 1 -10 7`} />
        </g>

        {/* beds */}
        <g stroke="rgba(22, 35, 59, 0.55)" strokeWidth="0.8">
          <polygon
            points={poly(-44, -36, -22, -12)}
            fill="rgba(238, 241, 244, 0.85)"
          />
          <polygon
            points={poly(18, -36, 40, -12)}
            fill="rgba(238, 241, 244, 0.85)"
          />
          <polygon
            points={poly(-44, 14, -22, 38)}
            fill="rgba(238, 241, 244, 0.85)"
          />
        </g>

        {/* token mark above the selected room */}
        {index < 3 && (
          <g>
            <line
              x1={cx(roomCenter(index)[0], roomCenter(index)[1])}
              y1={cy(roomCenter(index)[0], roomCenter(index)[1]) - 38}
              x2={cx(roomCenter(index)[0], roomCenter(index)[1])}
              y2={cy(roomCenter(index)[0], roomCenter(index)[1]) - 8}
              stroke="var(--brass)"
              strokeWidth="0.9"
              strokeDasharray="2 2"
            />
            <circle
              cx={cx(roomCenter(index)[0], roomCenter(index)[1])}
              cy={cy(roomCenter(index)[0], roomCenter(index)[1]) - 44}
              r="7"
              fill="var(--brass)"
              stroke="var(--ink)"
              strokeWidth="0.8"
            />
            <text
              x={cx(roomCenter(index)[0], roomCenter(index)[1])}
              y={cy(roomCenter(index)[0], roomCenter(index)[1]) - 41.5}
              textAnchor="middle"
              fontSize="5.5"
              fontFamily="var(--font-mono), monospace"
              fill="var(--ink)"
            >
              {index + 1}
            </text>
          </g>
        )}
      </g>

      <g>
        <text
          x="274"
          y="54"
          textAnchor="end"
          fontFamily="var(--font-mono), monospace"
          fontSize="7"
          fill="var(--graphite)"
        >
          {label ?? `R${index + 1}`}
        </text>
        <rect
          x="277"
          y="47"
          width="26"
          height="14"
          fill="none"
          stroke={roomTints[index] ?? "var(--graphite)"}
          strokeWidth="3"
          opacity="0.9"
        />
      </g>
    </svg>
  );
}

function roomCenter(index: number): [number, number] {
  const centers: Array<[number, number]> = [
    [-29, -23],
    [29, -23],
    [-29, 25],
    [29, 25],
  ];
  return centers[index] ?? centers[0];
}
