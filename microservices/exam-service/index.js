import express from "express";

const app = express();
const port = 3002;

const exams = [
  { id: 1, title: "JavaScript Fundamentals", status: "available" },
  { id: 2, title: "Node.js and Express", status: "draft" },
];

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "exam-service" });
});

app.get("/exams", (_request, response) => {
  response.json(exams);
});

app.listen(port, () => {
  console.log(`Exam service listening on port ${port}`);
});
