import express from "express";

const app = express();
const port = 3000;
const examServiceUrl = process.env.EXAM_SERVICE_URL;

app.get("/", (_request, response) => {
  response.json({
    service: "gateway",
    message: "The gateway routes requests to the exam service.",
    availableEndpoint: "/api/exams",
  });
});

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "gateway" });
});

app.get("/api/exams", async (_request, response) => {
  try {
    const examResponse = await fetch(`${examServiceUrl}/exams`);
    const exams = await examResponse.json();

    response.status(examResponse.status).json(exams);
  } catch (error) {
    response.status(502).json({
      error: "Unable to reach the exam service.",
    });
  }
});

app.listen(port, () => {
  console.log(`Gateway listening on port ${port}`);
});
