import "server-only";
import * as Sentry from "@sentry/nextjs";

export type ErrorTags = {
  area: string;
  city?: string;
  gym_id?: string;
  route?: string;
};

export function captureError(area: string, err: unknown, tags: Omit<ErrorTags, "area"> = {}): void {
  Sentry.captureException(err, {
    tags: {
      area,
      ...(tags.city ? { city: tags.city } : {}),
      ...(tags.gym_id ? { gym_id: tags.gym_id } : {}),
      ...(tags.route ? { route: tags.route } : {}),
    },
  });
}
