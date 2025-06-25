const mongoose = require("mongoose");

const JobsSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true, // Index for faster lookups
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
   
    jobType: {
      type: String,
        required: true,
        trim: true, 
    },
    banner: {
      type: String,
        required: true,
      trim: true,
    },
     description: {
      type: String,
      required: true,
      trim: true,
    },
    deadline: {
      type: Date,
        required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Jobs", JobsSchema);