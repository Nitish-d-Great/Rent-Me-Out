import { demo } from "@/lib/data";

export function TitleBlock({
  phase,
  sheet,
}: {
  phase: string;
  sheet: number;
}) {
  return (
    <div className="title-block" aria-hidden="true">
      <div className="title-block__row">
        <span className="title-block__label">Project</span>
        <span>{demo.propertyName}</span>
      </div>
      <div className="title-block__row">
        <span className="title-block__label">Drawing</span>
        <span>3 BHK · rental rights</span>
      </div>
      <div className="title-block__row">
        <span className="title-block__label">Sheet</span>
        <span className="title-block__sheet">{sheet} of 7</span>
      </div>
      <div className="title-block__row">
        <span className="title-block__label">Phase</span>
        <span className="title-block__phase">{phase}</span>
      </div>
    </div>
  );
}
