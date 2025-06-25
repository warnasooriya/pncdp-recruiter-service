const { ObjectId } = require('mongoose').Types;
const Job = require('../models/Jobs');

    exports.createJob = async (req, res) => {
        try {
            const { title, description, location, type, banner, deadline ,userId} = req.body;

            // Validate job data
            if(!userId){
                return res.status(400).json({ error: 'User ID is required' });
            }
            if(!title){
                return res.status(400).json({ error: 'Job title is required' });
            }
            if(!description){
                return res.status(400).json({ error: 'Job description is required' });
            }
            if(!location){
                return res.status(400).json({ error: 'Job location is required' });
            }
            if(!type){
                return res.status(400).json({ error: 'Job type is required' });
            }
            if(!req.files.banner){
                return res.status(400).json({ error: 'Job banner is required' });
            }
            if(!deadline){
                return res.status(400).json({ error: 'Job deadline is required' });
            }

            // Create a new job
            const newJob = new Job({
                userId,
                title,
                description,
                location,
                jobType:type,
                banner,
                deadline
            });

             if (req.files?.banner) {
                newJob.banner = `${req.files.banner[0].key}`;
            }

            await newJob.save();
            res.status(201).json({ message: 'Job created successfully', job: newJob });
        } catch (error) {
            console.error('Error creating job:', error);
            res.status(500).json({ error: 'Failed to create job' });
        }
    };