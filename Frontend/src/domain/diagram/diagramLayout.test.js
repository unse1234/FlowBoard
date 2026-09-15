import assert from "node:assert/strict";
import test from "node:test";
import { estimateTextWidth, LABEL_TEXT, layoutDiagram, wrapLabel } from "./diagramLayout.js";

// A real Gemini reply to "Create a basic authentication flow with login,
// credential validation, JWT generation, and dashboard": a decision with two
// labelled branches and a dashed loop back to an earlier step.
const LOGIN_FLOW = {
  title: "Basic User Authentication Flow",
  direction: "down",
  nodes: [
    { id: "user", type: "circle", label: "User", color: "blue" },
    { id: "login_page", type: "rect", label: "Login Page", color: "blue" },
    { id: "auth_server", type: "rect", label: "Auth API", color: "purple" },
    { id: "db", type: "circle", label: "User Database", color: "green" },
    { id: "check_credentials", type: "diamond", label: "Valid Credentials?", color: "amber" },
    { id: "generate_jwt", type: "rect", label: "Generate JWT Token", color: "purple" },
    { id: "show_error", type: "rect", label: "Show Invalid Credentials Error", color: "red" },
    { id: "dashboard", type: "rect", label: "User Dashboard", color: "green" },
  ],
  edges: [
    { from: "user", to: "login_page", label: "Enters credentials" },
    { from: "login_page", to: "auth_server", label: "POST /api/login" },
    { from: "auth_server", to: "db", label: "Query user" },
    { from: "db", to: "check_credentials", label: "Return hash" },
    { from: "check_credentials", to: "generate_jwt", label: "Yes" },
    { from: "check_credentials", to: "show_error", label: "No", dashed: true },
    { from: "show_error", to: "login_page", label: "Retry", dashed: true },
    { from: "generate_jwt", to: "dashboard", label: "Redirect with token" },
  ],
};

const ARCHITECTURE = {
  direction: "right",
  nodes: [
    { id: "browser", label: "Browser", type: "circle", color: "blue" },
    { id: "react", label: "React Client", type: "rect", color: "blue" },
    { id: "api", label: "Express API", type: "rect", color: "purple" },
    { id: "auth", label: "Auth Service", type: "rect", color: "purple" },
    { id: "cache", label: "Redis Cache", type: "rect", color: "amber" },
    { id: "db", label: "MongoDB", type: "circle", color: "green" },
    { id: "note", label: "Everything runs in Docker", type: "note" },
  ],
  edges: [
    { from: "browser", to: "react", label: "HTTPS" },
    { from: "react", to: "api", label: "REST" },
    { from: "api", to: "auth" },
    { from: "api", to: "cache", label: "reads", dashed: true },
    { from: "api", to: "db", label: "writes" },
    { from: "browser", to: "db" },
  ],
};

const FIXTURES = [
  ["a branching flow", LOGIN_FLOW],
  ["an architecture", ARCHITECTURE],
];

const measure = (text) => estimateTextWidth(text, { fontSize: LABEL_TEXT.fontSize });

function pointsOf(edge) {
  const points = [];
  for (let index = 0; index < edge.points.length; index += 2) {
    points.push({ x: edge.points[index], y: edge.points[index + 1] });
  }
  return points;
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function onOutline(point, box) {
  const within =
    point.x >= box.x - 1 &&
    point.x <= box.x + box.width + 1 &&
    point.y >= box.y - 1 &&
    point.y <= box.y + box.height + 1;
  const onEdge =
    Math.abs(point.x - box.x) <= 1 ||
    Math.abs(point.x - (box.x + box.width)) <= 1 ||
    Math.abs(point.y - box.y) <= 1 ||
    Math.abs(point.y - (box.y + box.height)) <= 1;

  return within && onEdge;
}

function segmentEntersBox(a, b, box) {
  const inner = { x: box.x + 1, y: box.y + 1, width: box.width - 2, height: box.height - 2 };
  const segment = {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x) || 0.001,
    height: Math.abs(a.y - b.y) || 0.001,
  };

  return overlaps(segment, inner);
}

function nodeById(layout, id) {
  return layout.nodes.find((node) => node.id === id);
}

test("lays out the same diagram identically every time", () => {
  for (const [, diagram] of FIXTURES) {
    assert.deepEqual(layoutDiagram(diagram), layoutDiagram(diagram));
  }
});

test("places nodes without overlap, with the diagram's corner at the origin", () => {
  for (const [description, diagram] of FIXTURES) {
    const layout = layoutDiagram(diagram);

    assert.equal(layout.nodes.length, diagram.nodes.length, description);
    for (const [index, node] of layout.nodes.entries()) {
      assert.ok(node.x >= 0 && node.y >= 0, `${description}: ${node.id} inside the origin`);
      assert.ok(node.x + node.width <= layout.width, `${description}: ${node.id} within width`);
      assert.ok(node.y + node.height <= layout.height, `${description}: ${node.id} within height`);

      for (const other of layout.nodes.slice(index + 1)) {
        assert.equal(overlaps(node, other), false, `${description}: ${node.id} and ${other.id}`);
      }
    }
  }
});

test("runs a flow downward and an architecture to the right", () => {
  const flow = layoutDiagram(LOGIN_FLOW);
  const flowYs = flow.nodes.map((node) => node.y);
  assert.equal(nodeById(flow, "user").y, Math.min(...flowYs));
  assert.ok(nodeById(flow, "dashboard").y > nodeById(flow, "generate_jwt").y);

  const architecture = layoutDiagram(ARCHITECTURE);
  const xs = architecture.nodes.map((node) => node.x);
  assert.equal(nodeById(architecture, "browser").x, Math.min(...xs));
  assert.ok(nodeById(architecture, "api").x > nodeById(architecture, "react").x);
});

test("connects each edge from its source's outline to its target's with straight segments", () => {
  for (const [description, diagram] of FIXTURES) {
    const layout = layoutDiagram(diagram);
    assert.equal(layout.edges.length, diagram.edges.length, description);

    for (const edge of layout.edges) {
      const points = pointsOf(edge);
      const name = `${description}: ${edge.from} -> ${edge.to}`;

      assert.ok(onOutline(points[0], nodeById(layout, edge.from)), `${name} starts on its source`);
      assert.ok(onOutline(points.at(-1), nodeById(layout, edge.to)), `${name} ends on its target`);

      for (let index = 0; index + 1 < points.length; index += 1) {
        const [a, b] = [points[index], points[index + 1]];
        assert.ok(a.x === b.x || a.y === b.y, `${name} segment ${index} is axis-aligned`);
      }
    }
  }
});

test("routes edges around nodes rather than through them", () => {
  for (const [description, diagram] of FIXTURES) {
    const layout = layoutDiagram(diagram);

    for (const edge of layout.edges) {
      const points = pointsOf(edge);

      for (const node of layout.nodes) {
        if (node.id === edge.from || node.id === edge.to) continue;

        for (let index = 0; index + 1 < points.length; index += 1) {
          assert.equal(
            segmentEntersBox(points[index], points[index + 1], node),
            false,
            `${description}: ${edge.from} -> ${edge.to} crosses ${node.id}`,
          );
        }
      }
    }
  }
});

test("keeps edge labels clear of every node", () => {
  for (const [description, diagram] of FIXTURES) {
    const layout = layoutDiagram(diagram);

    for (const edge of layout.edges.filter((candidate) => candidate.label)) {
      for (const node of layout.nodes) {
        assert.equal(
          overlaps(edge.label, node),
          false,
          `${description}: label of ${edge.from} -> ${edge.to} covers ${node.id}`,
        );
      }
    }
  }
});

test("centres each node's label inside it", () => {
  const layout = layoutDiagram(LOGIN_FLOW);

  for (const node of layout.nodes) {
    const box = node.labelBox;
    assert.ok(box.x >= node.x && box.x + box.width <= node.x + node.width, `${node.id} x`);
    assert.ok(box.y >= node.y && box.y + box.height <= node.y + node.height, `${node.id} y`);
    assert.ok(Math.abs(box.x + box.width / 2 - (node.x + node.width / 2)) <= 1);
    assert.ok(Math.abs(box.y + box.height / 2 - (node.y + node.height / 2)) <= 1);
  }
});

test("puts a decision's branches side by side in the next rank", () => {
  const layout = layoutDiagram(LOGIN_FLOW);
  const yes = nodeById(layout, "generate_jwt");
  const no = nodeById(layout, "show_error");

  assert.equal(yes.y + yes.height / 2, no.y + no.height / 2);
  assert.notEqual(yes.x, no.x);
});

test("sends a loop back around the outside of the diagram", () => {
  const layout = layoutDiagram(LOGIN_FLOW);
  const loop = layout.edges.find((edge) => edge.from === "show_error" && edge.to === "login_page");
  const points = pointsOf(loop);
  const laneX = points[2].x;

  assert.equal(points.length, 6);
  assert.ok(
    layout.nodes.every((node) => laneX > node.x + node.width) ||
      layout.nodes.every((node) => laneX < node.x),
    "the lane runs beside every node",
  );
});

test("lays out unconnected nodes in rows instead of one long line", () => {
  const layout = layoutDiagram({
    direction: "down",
    nodes: ["A", "B", "C", "D", "E"].map((label) => ({ id: label, label, type: "rect" })),
    edges: [],
  });

  assert.ok(new Set(layout.nodes.map((node) => node.y)).size >= 2);
  for (const [index, node] of layout.nodes.entries()) {
    for (const other of layout.nodes.slice(index + 1)) assert.equal(overlaps(node, other), false);
  }
});

test("handles a cycle with no natural start", () => {
  const layout = layoutDiagram({
    direction: "down",
    nodes: ["a", "b", "c"].map((id) => ({ id, label: id.toUpperCase(), type: "rect" })),
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "a" },
    ],
  });

  assert.equal(layout.edges.length, 3);
  assert.equal(new Set(layout.nodes.map((node) => node.y)).size, 3);
});

test("wraps labels into balanced lines that fit", () => {
  assert.deepEqual(wrapLabel("Login", 180, measure), ["Login"]);

  const lines = wrapLabel("Show Invalid Credentials Error", 180, measure);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => measure(line) <= 180));
  assert.ok(Math.abs(measure(lines[0]) - measure(lines[1])) < measure("Credentials"));

  const pieces = wrapLabel("Supercalifragilisticexpialidocious", 80, measure);
  assert.ok(pieces.length > 1);
  assert.ok(pieces.every((line) => measure(line) <= 80));
  assert.equal(pieces.join(""), "Supercalifragilisticexpialidocious");
});
