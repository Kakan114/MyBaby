import type { CalendarDate } from '../domain/calendar-date';
import { createChild, type Child } from '../domain/child';
import type { ActiveChildRepository } from './active-child-repository';
import type { ChildIdGenerator } from './child-id-generator';
import type { ChildRepository } from './child-repository';

export type CreateChildRequest = Readonly<{
  displayName: string;
  dateOfBirth: string;
}>;

export type CreateChildDependencies = Readonly<{
  activeChildRepository: ActiveChildRepository;
  childRepository: ChildRepository;
  childIdGenerator: ChildIdGenerator;
}>;

export async function createChildUseCase(
  dependencies: CreateChildDependencies,
  request: CreateChildRequest,
  asOf: CalendarDate,
): Promise<Child> {
  const child = createChild(
    {
      id: dependencies.childIdGenerator.generate(),
      displayName: request.displayName,
      dateOfBirth: request.dateOfBirth,
    },
    asOf,
  );

  await dependencies.childRepository.save(child);
  await dependencies.activeChildRepository.setActiveChildIdIfUnset(child.id);

  return child;
}
