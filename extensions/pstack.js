import { Type } from "typebox";
import register, { ROLES } from "../src/extension.mjs";

// Pi supplies TypeBox when loading extensions, keeping the package dependency free.
export default function pstack(pi) {
  register(pi, Type.Object({
    tasks: Type.Array(Type.Object({
      task: Type.String({ minLength: 1 }),
      role: Type.Optional(Type.Union(ROLES.map((role) => Type.Literal(role)))),
      model: Type.Optional(Type.String()),
      agent: Type.Optional(Type.Union(["generalPurpose", "poteto-agent", "comment-sicko"].map((agent) => Type.Literal(agent)))),
      cwd: Type.Optional(Type.String()),
    }), { minItems: 1, maxItems: 8 }),
  }));
}
