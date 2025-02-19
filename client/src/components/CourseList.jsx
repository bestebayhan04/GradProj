import React, { useEffect, useState } from 'react';

const CourseList = () => {
    const [courses, setCourses] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_URL}/api/courses`, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                setCourses(data);
            } catch (err) {
                console.error('Error fetching courses:', err);
                setError(err.message);
            }
        };

        fetchCourses();
    }, []);

    return (
        <div>
            <h2>Courses</h2>
            {error && <p>Error: {error}</p>}
            <ul>
                {courses.map((course, index) => (
                    <li key={index}>{course}</li>
                ))}
            </ul>
        </div>
    );
};

export default CourseList; 