import { Router } from "express";
import { analyzePhoneNumber } from "../services/phone-intelligence.js";

const router = Router();

router.post("/analyze", (req, res) => {
  const result = analyzePhoneNumber(req.body?.phone, "ID");
  if (!result.ok) return res.status(400).json(result);
  return res.json(result);
});

export default router;
