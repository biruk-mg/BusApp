import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EthioBus API',
      version: '1.0.0',
      description: 'Full Stack Bus Booking Platform API — Built with Node.js, Express, TypeScript, Prisma & PostgreSQL',
      contact: {
        name: 'EthioBus Team',
      },
    },
    servers: [
      {
        url: 'https://busapi-production.up.railway.app',
        description: 'Production server',
      },
      {
        url: 'http://localhost:4000',
        description: 'Local development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Routes', description: 'Bus route management' },
      { name: 'Schedules', description: 'Bus schedule management' },
      { name: 'Bookings', description: 'Ticket booking management' },
      { name: 'Payments', description: 'Payment processing' },
      { name: 'Operator', description: 'Bus operator management' },
    ],
    paths: {
      '/api/v1/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new user',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'phone', 'password'],
                  properties: {
                    name: { type: 'string', example: 'Ruham Tesfaye' },
                    phone: { type: 'string', example: '0912345678' },
                    email: { type: 'string', example: 'ruham@example.com' },
                    password: { type: 'string', example: 'password123' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'User registered successfully' },
            409: { description: 'Phone number already registered' },
          },
        },
      },
      '/api/v1/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login with phone and password',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['phone', 'password'],
                  properties: {
                    phone: { type: 'string', example: '0912345678' },
                    password: { type: 'string', example: 'password123' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login successful, returns JWT token' },
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/api/v1/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current logged in user',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Current user data' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/v1/routes': {
        get: {
          tags: ['Routes'],
          summary: 'Get all bus routes',
          responses: {
            200: { description: 'List of all routes' },
          },
        },
        post: {
          tags: ['Routes'],
          summary: 'Create a new route (Admin only)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fromCity', 'toCity', 'distanceKm', 'estimatedDurationMin'],
                  properties: {
                    fromCity: { type: 'string', example: 'Addis Ababa' },
                    toCity: { type: 'string', example: 'Hawassa' },
                    distanceKm: { type: 'number', example: 275 },
                    estimatedDurationMin: { type: 'number', example: 270 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Route created successfully' },
            409: { description: 'Route already exists' },
          },
        },
      },
      '/api/v1/routes/{id}': {
        get: {
          tags: ['Routes'],
          summary: 'Get a single route by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Route data' },
            404: { description: 'Route not found' },
          },
        },
        delete: {
          tags: ['Routes'],
          summary: 'Delete a route (Admin only)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Route deleted' },
          },
        },
      },
      '/api/v1/schedules/search': {
        get: {
          tags: ['Schedules'],
          summary: 'Search available schedules',
          parameters: [
            { name: 'fromCity', in: 'query', required: true, schema: { type: 'string' }, example: 'Addis Ababa' },
            { name: 'toCity', in: 'query', required: true, schema: { type: 'string' }, example: 'Hawassa' },
            { name: 'date', in: 'query', required: true, schema: { type: 'string' }, example: '2026-05-20' },
          ],
          responses: {
            200: { description: 'List of available schedules with seat availability' },
          },
        },
      },
      '/api/v1/schedules': {
        get: {
          tags: ['Schedules'],
          summary: 'Get all schedules',
          responses: {
            200: { description: 'List of all schedules' },
          },
        },
        post: {
          tags: ['Schedules'],
          summary: 'Create a new schedule (Admin only)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['routeId', 'busId', 'departureTime', 'arrivalTime', 'price'],
                  properties: {
                    routeId: { type: 'string' },
                    busId: { type: 'string' },
                    departureTime: { type: 'string', example: '2026-05-20T06:00:00.000Z' },
                    arrivalTime: { type: 'string', example: '2026-05-20T07:30:00.000Z' },
                    price: { type: 'number', example: 150 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Schedule created' },
          },
        },
      },
      '/api/v1/bookings': {
        post: {
          tags: ['Bookings'],
          summary: 'Create a new booking',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['scheduleId', 'seatNumbers'],
                  properties: {
                    scheduleId: { type: 'string' },
                    seatNumbers: { type: 'array', items: { type: 'string' }, example: ['01', '02'] },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Booking confirmed with QR code' },
            409: { description: 'Seat already booked' },
          },
        },
      },
      '/api/v1/bookings/my': {
        get: {
          tags: ['Bookings'],
          summary: 'Get my bookings',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'List of user bookings' },
          },
        },
      },
      '/api/v1/bookings/{id}': {
        get: {
          tags: ['Bookings'],
          summary: 'Get a single booking',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Booking details with QR code' },
            404: { description: 'Booking not found' },
          },
        },
      },
      '/api/v1/bookings/{id}/cancel': {
        patch: {
          tags: ['Bookings'],
          summary: 'Cancel a booking',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Booking cancelled' },
          },
        },
      },
      '/api/v1/payments/initialize': {
        post: {
          tags: ['Payments'],
          summary: 'Initialize Chapa payment for a booking',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['bookingId'],
                  properties: {
                    bookingId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Returns Chapa checkout URL' },
          },
        },
      },
      '/api/v1/payments/verify': {
        get: {
          tags: ['Payments'],
          summary: 'Verify payment after Chapa callback',
          parameters: [{ name: 'trx_ref', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Payment verified' },
          },
        },
      },
      '/api/v1/operator/stats': {
        get: {
          tags: ['Operator'],
          summary: 'Get operator dashboard stats',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Total buses, bookings and revenue' },
          },
        },
      },
      '/api/v1/operator/buses': {
        get: {
          tags: ['Operator'],
          summary: 'Get operator buses',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'List of operator buses' },
          },
        },
        post: {
          tags: ['Operator'],
          summary: 'Add a new bus',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['plateNumber', 'totalSeats', 'busType'],
                  properties: {
                    plateNumber: { type: 'string', example: 'AA-12345' },
                    totalSeats: { type: 'number', example: 45 },
                    busType: { type: 'string', enum: ['STANDARD', 'LUXURY', 'MINIBUS'] },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Bus added successfully' },
          },
        },
      },
      '/api/v1/operator/bookings': {
        get: {
          tags: ['Operator'],
          summary: 'Get all bookings for operator buses',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'List of bookings with total revenue' },
          },
        },
      },
      '/health': {
        get: {
          tags: ['Auth'],
          summary: 'Health check',
          responses: {
            200: { description: 'API is running' },
          },
        },
      },
    },
  },
  apis: [],
}

export const swaggerSpec = swaggerJsdoc(options)