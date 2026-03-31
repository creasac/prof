# prof

`prof` is an adaptive learning system built around two core experiences:
- structured learning artifacts such as plans, lessons, quizzes, q&a, flashcards, and other study tools
- live tutoring that helps a learner move through those artifacts

## Product intent
- Let a learner describe what they want to learn, how deep they want to go, and any context that matters.
- Turn that into a course shape that is specific to the learner instead of generic curriculum output.
- Generate only the next useful piece of learning material instead of expanding everything up front.
- Keep the course editable as the learner clarifies goals or changes direction.

## Operating principles
- The app should adapt to prior knowledge, goals, pace, and progress.
- Structured artifacts should be typed, inspectable, and updateable.
- Live tutoring and slower reasoning are separate concerns even when they share context.
- The backend, not model memory, should remain the source of truth for learning state.
- The set of artifact types and learning tools should stay open-ended.

## Typical workflow
1. The learner states a goal and optional context such as experience level, desired depth, files, or URLs.
2. The system asks clarifying questions only when they materially improve the course shape.
3. The system creates or updates a plan and then generates one topic or artifact at a time.
4. The learner studies, chats, or uses live guidance while moving through the material.
5. The system updates the course as the learner progresses or changes requirements.
