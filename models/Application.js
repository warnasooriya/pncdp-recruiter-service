const mongoose = require("mongoose");

const ApplicationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true, // Index for faster lookups
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      trim: true,
       ref: 'Jobs'
    },
    resume: {
      type: String,
      required: true,
      trim: true,
    }
  
    
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Application", ApplicationSchema);